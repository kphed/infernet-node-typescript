// Reference: https://github.com/ritual-net/infernet-node/blob/2632a0b43b54216fb9616ff0c925edfdf48d7004/src/chain/processor.py.
import { encodeAbiParameters, Hex, stringToHex } from 'viem';
import { Mutex } from 'async-mutex';
import { Coordinator, CoordinatorSignatureParams } from './coordinator';
import { InfernetError } from './errors';
import { PaymentWallet } from './paymentWallet';
import { Registry } from './registry';
import { RPC } from './rpc';
import { Wallet } from './wallet';
import { WalletChecker } from './walletChecker';
import { Orchestrator } from '../orchestration/orchestrator';
import {
  ContainerError,
  ContainerOutput,
  JobInput,
  JobLocation,
} from '../shared/job';
import {
  DelegatedSubscriptionMessage,
  MessageType,
  OnchainMessage,
  SubscriptionCreatedMessage,
} from '../shared/message';
import { AsyncTask } from '../shared/service';
import { Subscription } from '../shared/subscription';
import { ContainerLookup } from './containerLookup';
import { cloneDeepJSON } from '../utils/helpers';

const BLOCKED: Hex = '0xblocked';

const RESPONSE_KEYS = [
  'raw_input',
  'processed_input',
  'raw_output',
  'processed_output',
  'proof',
];

type Interval = number;

type SubscriptionID = number;

type DelegateSubscriptionID = [Hex, number];

type UnionID = SubscriptionID | DelegateSubscriptionID;

type DelegateSubscriptionData = [
  Subscription,
  CoordinatorSignatureParams,
  { [key: string]: any }
];

const makeDelegateSubscriptionsKey = (
  subOwner: Hex,
  sigNonce: number
): string => `${subOwner}-${sigNonce}`;

const makePendingOrAttemptsKey = (id: UnionID, interval: Interval): string => {
  const _id = Array.isArray(id)
    ? makeDelegateSubscriptionsKey(id[0], id[1])
    : id;

  return `${_id}-${interval}`;
};

const parsePendingOrAttemptsKey = (key: string): [UnionID, Interval] => {
  const items = key.split('-');

  if (items.length === 2) {
    // Parse key with this format: `${SubscriptionID}-${Interval}`.
    return [Number(items[0]), Number(items[1])];
  } else if (items.length === 3) {
    // Parse key with this format: `${Hex}-${number}-${Interval}`
    return [[items[0] as Hex, Number(items[1])], Number(items[2])];
  }

  throw new Error(`Invalid key: ${key}`);
};

class ChainProcessor extends AsyncTask {
  #rpc: RPC;
  #coordinator: Coordinator;
  #wallet: Wallet;
  #payment_wallet: PaymentWallet;
  #wallet_checker: WalletChecker;
  #registry: Registry;
  #orchestrator: Orchestrator;
  #container_lookup: ContainerLookup;
  #subscriptions: {
    [key: SubscriptionID]: Subscription;
  };
  #delegate_subscriptions: {
    [key: string]: DelegateSubscriptionData;
  };
  #pending: {
    [key: string]: Hex;
  };
  #attempts: {
    [key: string]: number;
  };
  #attempts_lock: Mutex;

  constructor(
    rpc: RPC,
    coordinator: Coordinator,
    wallet: Wallet,
    payment_wallet: PaymentWallet,
    wallet_checker: WalletChecker,
    registry: Registry,
    orchestrator: Orchestrator,
    container_lookup: ContainerLookup
  ) {
    super();

    this.#rpc = rpc;
    this.#coordinator = coordinator;
    this.#wallet = wallet;
    this.#payment_wallet = payment_wallet;
    this.#wallet_checker = wallet_checker;
    this.#registry = registry;
    this.#orchestrator = orchestrator;
    this.#container_lookup = container_lookup;
    this.#subscriptions = {};
    this.#delegate_subscriptions = {};
    this.#pending = {};
    this.#attempts = {};

    console.info('Initialized ChainProcessor');

    this.#attempts_lock = new Mutex();
  }

  /**
   * Tracks SubscriptionCreatedMessage.
   *
   * Process:
   * 1. Adds subscription to tracked _subscriptions
   */
  #track_created_message(msg: SubscriptionCreatedMessage): void {
    this.#subscriptions[msg.subscription.id] = msg.subscription;

    console.info('Tracked new subscription!', {
      id: msg.subscription.id,
      total: Object.keys(this.#subscriptions).length,
    });
  }

  /**
   * Tracks DelegatedSubscriptionMessage.
   *
   * Process:
   * 1. Checks if delegated subscription already exists on-chain.
   *    1.1. If so, evicts relevant run from pending and attempts to allow forced re-execution.
   * 2. Collects recovered signer from signature.
   * 3. Collects delegated signer from chain.
   * 4. Verifies that recovered signer == delegated signer.
   * 5. If verified, adds subscription to _delegate_subscriptions, indexed by (owner, nonce).
   */
  async #track_delegated_message(
    msg: DelegatedSubscriptionMessage
  ): Promise<void> {
    const subscription: Subscription = msg.subscription.deserialize(
      this.#container_lookup
    );
    const { signature } = msg;
    const headBlock = await this.#rpc.get_head_block_number();
    const [exists, id] =
      await this.#coordinator.get_existing_delegate_subscription(
        subscription,
        signature,
        headBlock
      );

    if (exists) {
      // Check if subscription is tracked locally, this can happen if the
      // user made a delegated subscription request again through the rest API,
      // or if another node had already created the same delegated subscription.
      const tracked = this.#subscriptions[id];

      console.info('Delegated subscription exists on-chain', {
        id,
        tracked,
      });

      const key = makePendingOrAttemptsKey(
        [subscription.owner, signature.nonce],
        subscription.interval()
      );

      if (this.#pending[key]) {
        delete this.#pending[key];

        console.info('Evicted past pending subscription tx', {
          run: key,
        });
      }

      if (this.#attempts[key]) {
        delete this.#attempts[key];

        console.info('Evicted past pending subscription attempts', {
          run: key,
        });
      }
    } else {
      let recoveredSigner;

      try {
        recoveredSigner = await this.#coordinator.recover_delegatee_signer(
          subscription,
          signature
        );

        console.debug('Recovered delegatee signer', {
          address: recoveredSigner,
        });
      } catch (err) {
        console.error('Could not recover delegatee signer', {
          subscription,
          signature,
        });

        return;
      }

      const delegatedSigner = await this.#coordinator.get_delegated_signer(
        subscription,
        headBlock
      );

      console.debug('Collected delegated signer', {
        address: delegatedSigner,
      });

      if (recoveredSigner !== delegatedSigner) {
        console.error('Subscription signer mismatch', {
          recovered: recoveredSigner,
          delegated: delegatedSigner,
        });

        return;
      } else {
        const subId = makeDelegateSubscriptionsKey(
          subscription.owner,
          signature.nonce
        );

        this.#delegate_subscriptions[subId] = [
          subscription,
          signature,
          msg.data,
        ];

        console.info('Tracked new delegate subscription', { sub_id: subId });
      }
    }
  }

  /**
   * Checks whether node has responded on-chain in interval (non-pending).
   */
  async #has_responded_onchain_in_interval(
    subscription_id: SubscriptionID
  ): Promise<boolean> {
    const sub = this.#subscriptions[subscription_id];
    const subInterval = sub.interval();

    if (sub.get_node_replied(subInterval)) return true;

    const headBlock = await this.#rpc.get_head_block_number();
    const nodeResponded =
      await this.#coordinator.get_node_has_delivered_response(
        subscription_id,
        subInterval,
        this.#wallet.address,
        headBlock
      );

    if (nodeResponded) {
      console.info('Node has already responded for this interval', {
        id: sub.id,
        interval: subInterval,
      });

      sub.set_node_replied(subInterval);
    }

    return nodeResponded;
  }

  /**
   * Prunes pending txs that have failed to allow for re-processing.
   *
   * Process:
   * 1. Checks for txs that are non-blocked, found on-chain, and failed.
   * 2. Increments self._attempts dict.
   * 3. If self._attempts[tx] < 3, evicts failed tx else keeps blocked.
   */
  async #prune_failed_txs(): Promise<void> {
    const failedTxs: string[] = [];

    await this.#attempts_lock.runExclusive(async () => {
      const pendingCopy = cloneDeepJSON(this.#pending);
      const pendingCopyKeys = Object.keys(pendingCopy);

      for (let i = 0; i < pendingCopyKeys.length; i++) {
        const key = pendingCopyKeys[i];
        const txHash = pendingCopy[key];

        if (txHash !== BLOCKED) {
          const [found, success] = await this.#rpc.get_tx_success(txHash);

          if (!found) continue;
          if (success) {
            if (this.#attempts[key]) delete this.#attempts[key];
          } else {
            failedTxs.push(key);
          }
        }
      }

      // Evict failed txs.
      failedTxs.forEach((key) => {
        if (this.#attempts[key]) {
          this.#attempts[key] += 1;
        } else {
          this.#attempts[key] = 1;
        }

        const attemptCount = this.#attempts[key];

        console.debug('attempt count', { count: attemptCount, key });

        // Evict failed tx if it has less than 3 failed attempts so that it can be reprocessed.
        if (attemptCount < 3) {
          const [id, interval] = parsePendingOrAttemptsKey(key);
          const txHash = this.#pending[key];

          delete this.#pending[key];

          console.info('Evicted failed tx', {
            id,
            interval,
            tx_hash: txHash,
            retries: attemptCount,
          });
        }
      });
    });
  }

  /**
   * Stops tracking subscription (or delegated subscription).
   * 1. Deletes subscription from _subscriptions or _delegate_subscriptions.
   * 2. Deletes any pending transactions being checked.
   */
  #stop_tracking(subscription_id: UnionID, delegated: boolean): void {
    const subIdKey = Array.isArray(subscription_id)
      ? makeDelegateSubscriptionsKey(subscription_id[0], subscription_id[1])
      : `${subscription_id}`;

    if (delegated) {
      if (this.#delegate_subscriptions[subIdKey])
        delete this.#delegate_subscriptions[subIdKey];
    } else {
      if (this.#subscriptions[subIdKey]) delete this.#subscriptions[subIdKey];
    }

    const pendingKeys = Object.keys(this.#pending);

    for (let i = 0; i < pendingKeys.length; i++) {
      const pendingKey = pendingKeys[i];
      const [pendingSubId, pendingInterval] =
        parsePendingOrAttemptsKey(pendingKey);

      // Convert `pendingSubId` into a string for equality comparison.
      const pendingSubIdKey = Array.isArray(pendingSubId)
        ? makeDelegateSubscriptionsKey(pendingSubId[0], pendingSubId[1])
        : `${pendingSubId}`;

      if (pendingSubIdKey === subIdKey) {
        delete this.#pending[pendingKey];

        console.debug('Deleted pending transactions being checked', {
          id: subscription_id,
          interval: pendingInterval,
        });
      }
    }

    console.info(`Stopped tracking subscription: ${subscription_id}`, {
      id: subscription_id,
    });
  }

  /**
   * Checks if a subscription (or delegated subscription) has a pending tx for current interval.
   */
  has_subscription_tx_pending_in_interval(subscription_id: UnionID): boolean {
    let sub;

    // Check whether `subscription_id` is of type `SubscriptionID` (a number).
    if (typeof subscription_id === 'number') {
      sub = this.#subscriptions[subscription_id];
    } else {
      [sub] =
        this.#delegate_subscriptions[
          makeDelegateSubscriptionsKey(subscription_id[0], subscription_id[1])
        ];
    }

    const pendingKey = makePendingOrAttemptsKey(subscription_id, sub.interval);

    return !!this.#pending[pendingKey];
  }

  /**
   * Serializes container output param as bytes.
   */
  #serialize_param(input?: string) {
    return stringToHex(input ?? '');
  }

  /**
   * Serializes container output to conform to on-chain fn input.
   *
   * Process:
   * 1. Check if all 5 keys are present in container output.
   *    1.1. If so, parse returned output as raw bytes and generate returned data.
   * 2. Else, serialize data into string and return as output.
   */
  #serialize_container_output(containerOutput: ContainerOutput) {
    const { output } = containerOutput;
    const outputKeys = Object.keys(output).reduce(
      (acc, val) => ({
        ...acc,
        [val]: true,
      }),
      {}
    );
    const allKeysExist = RESPONSE_KEYS.every((key) => outputKeys[key]);

    if (allKeysExist) {
      return [
        encodeAbiParameters(
          [
            {
              type: 'bytes',
            },
            {
              type: 'bytes',
            },
          ],
          [
            this.#serialize_param(output['raw_input']),
            this.#serialize_param(output['processed_input']),
          ]
        ),
        encodeAbiParameters(
          [
            {
              type: 'bytes',
            },
            {
              type: 'bytes',
            },
          ],
          [
            this.#serialize_param(output['raw_output']),
            this.#serialize_param(output['processed_output']),
          ]
        ),
        this.#serialize_param(output['proof']),
      ];
    }

    return [
      stringToHex(''),
      encodeAbiParameters([{ type: 'string' }], [JSON.stringify(output)]),
      stringToHex(''),
    ];
  }

  /**
   * Check if the subscription owner can pay for the subscription. If not, stop
   * tracking the subscription. Checks for:
   * 1. Invalid wallet.
   * 2. Insufficient balance.
   */
  async #stop_tracking_if_sub_owner_cant_pay(
    sub_id: SubscriptionID
  ): Promise<boolean> {
    const sub = this.#subscriptions[sub_id];

    if (!sub) return true;
    if (!sub.provides_payment) return false;

    const banner = `Skipping subscription: ${sub_id}`;

    if (!(await this.#wallet_checker.is_valid_wallet(sub.wallet))) {
      console.info(
        `
        ${banner}: Invalid subscription wallet, please use a wallet generated
        by infernet's \`WalletFactory\``,
        {
          sub_id: sub.id,
          wallet: sub.wallet,
        }
      );

      this.#stop_tracking(sub.id, false);

      return true;
    }

    const [hasBalance, balance] = await this.#wallet_checker.has_enough_balance(
      sub.wallet,
      sub.payment_token,
      sub.payment_amount
    );

    if (!hasBalance) {
      console.info(`${banner}: Subscription wallet has insufficient balance`, {
        sub_id: sub.id,
        wallet: sub.wallet,
        sub_amount: sub.payment_amount,
        wallet_balance: balance,
      });

      this.#stop_tracking(sub.id, false);

      return true;
    }

    return false;
  }

  /**
   * Check if the subscription has been cancelled on-chain, if so, stop tracking it.
   */
  async #stop_tracking_if_cancelled(sub_id: SubscriptionID): Promise<boolean> {
    const sub: Subscription = await this.#coordinator.get_subscription_by_id(
      sub_id
    );

    if (sub.cancelled()) {
      console.info('Subscription cancelled', { id: sub_id });

      this.#stop_tracking(sub.id, false);

      return true;
    }

    return false;
  }

  /**
   * Check if the delegated subscription has already been completed. If so, stop
   * tracking it.
   *
   * Note that delegated subscriptions may not have a subscription id yet generated,
   * since we allow for delegated subscriptions to be created & fulfilled in the same
   * transaction. In such cases, we use the owner-nonce pair as the subscription id.
   *
   * For delegated subscriptions, we only check if the transaction has already been
   * submitted and was successful.
   * 1. For one-off delegated subscriptions (where redundancy=1 & frequency =1),
   * this is sufficient.
   * 2. For recurring delegated subscriptions (redundancy>1 or frequency>1),
   * the same subscription will get tracked again as it will show up on-chain
   * & will get picked up by the listener. Past that point, the tracking of that
   * subscription will be handled by the regular subscription tracking logic.
   */
  async #stop_tracking_delegated_sub_if_completed(
    sub_id: DelegateSubscriptionID
  ): Promise<boolean> {
    const [sub]: DelegateSubscriptionData =
      this.#delegate_subscriptions[
        makeDelegateSubscriptionsKey(sub_id[0], sub_id[1])
      ];
    const txHash =
      this.#pending[makePendingOrAttemptsKey(sub_id, sub.interval())];

    // We have not yet submitted the transaction for this delegated subscription.
    if (!txHash || txHash === BLOCKED) return false;

    const [found, success] = await this.#rpc.get_tx_success_with_retries(
      txHash
    );

    // We have already submitted the transaction and it was successful.
    if (found && success) {
      console.info('Delegated subscription completed for interval', {
        id: sub_id,
        interval: sub.interval(),
      });

      this.#stop_tracking(sub_id, true);

      return true;
    }

    return false;
  }

  /**
   * Check if the subscription has already been completed. If so, stop tracking it.
   *
   * This updates the response count for the subscription by reading it from on-chain
   * storage. If the subscription has already been completed, it stops tracking it.
   */
  async #stop_tracking_sub_if_completed(
    subscription: Subscription
  ): Promise<boolean> {
    const { id } = subscription;
    const interval = subscription.interval();
    const responseCount =
      await this.#coordinator.get_subscription_response_count(id, interval);

    subscription.set_response_count(interval, responseCount);

    if (subscription.completed()) {
      console.info('Subscription already completed', {
        id,
        interval,
      });

      this.#stop_tracking(id, false);

      return true;
    }

    return false;
  }

  /**
   * Check if the subscription has exceeded the maximum number of attempts. If so,
   * stop tracking it.
   */
  async #stop_tracking_if_maximum_retries_reached(
    sub_key: [UnionID, Interval],
    delegated: boolean
  ): Promise<boolean> {
    const key = makePendingOrAttemptsKey(sub_key[0], sub_key[1]);

    if (this.#attempts[key]) {
      const attemptCount = this.#attempts[key];

      if (attemptCount >= 3) {
        console.error(
          'Subscription has exceeded the maximum number of attempts',
          {
            id: sub_key[0],
            interval: sub_key[1],
            tx_hash: this.#pending[key],
            attempts: attemptCount,
          }
        );

        console.info('Clearing attempts', { sub_key });

        delete this.#attempts[key];

        await this.#attempts_lock.runExclusive(async () => {
          // Delete subcription.
          this.#stop_tracking(sub_key[0], delegated);
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Check if the subscription has missed the deadline. If so, stop tracking it.
   */
  #stop_tracking_sub_if_missed_deadline(
    subscription_id: UnionID,
    delegated: boolean
  ): boolean {
    let subscription: Subscription;

    if (!delegated && typeof subscription_id === 'number') {
      subscription = this.#subscriptions[subscription_id as SubscriptionID];
    } else {
      [subscription] =
        this.#delegate_subscriptions[
          makeDelegateSubscriptionsKey(subscription_id[0], subscription_id[1])
        ];
    }

    // Checking if subscription is falsy is necessary because the subscription may have
    // been deleted in `#process_subscription`.
    if (!subscription) return true;

    if (subscription.past_last_interval()) {
      console.info('Subscription expired', {
        id: subscription.id,
        interval: subscription.interval(),
      });

      this.#stop_tracking(subscription_id, delegated);

      return true;
    }

    return false;
  }

  /**
   * We first attempt a delivery with empty (input, output, proof) to check if there
   * are any infernet-related errors caught during the transaction simulation. This
   * allows us to catch a multitude of errors even if we had run the compute. This
   * prevents the node from wasting resources on a compute that would have failed
   * on-chain.
   */
  async #stop_tracking_if_infernet_errors_caught_in_simulation(
    subscription: Subscription,
    delegated: boolean,
    signature?: CoordinatorSignatureParams
  ): Promise<boolean> {
    if (subscription.requires_proof()) return false;

    try {
      await this.#deliver(subscription, delegated, signature, true);
    } catch (err) {
      if (err instanceof InfernetError && subscription.is_callback()) {
        this.#stop_tracking(subscription.id, delegated);

        return true;
      }
    }

    return false;
  }

  /**
   * Deliver the compute to the chain.
   */
  async #deliver(
    subscription: Subscription,
    delegated: boolean,
    signature: CoordinatorSignatureParams | undefined,
    simulate_only: boolean,
    input: Hex = '0x',
    output: Hex = '0x',
    proof: Hex = '0x'
  ): Promise<Hex> {
    let txHash;

    if (delegated && signature) {
      txHash = await this.#wallet.deliver_compute_delegatee(
        subscription,
        signature,
        input,
        output,
        proof,
        simulate_only
      );
    } else {
      txHash = await this.#wallet.deliver_compute(
        subscription,
        input,
        output,
        proof,
        simulate_only
      );
    }

    return txHash;
  }

  setup() {}

  cleanup() {}

  track() {}

  run_forever() {}
}
