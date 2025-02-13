// Reference: https://github.com/ritual-net/infernet-node/blob/2632a0b43b54216fb9616ff0c925edfdf48d7004/src/chain/processor.py.
import { Hex } from 'viem';
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

  setup() {}

  cleanup() {}

  track() {}

  run_forever() {}
}
