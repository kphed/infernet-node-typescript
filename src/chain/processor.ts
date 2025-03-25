// Reference: https://github.com/ritual-net/infernet-node/blob/2632a0b43b54216fb9616ff0c925edfdf48d7004/src/chain/processor.py.
import { z } from 'zod';
import {
  encodeAbiParameters,
  Hex,
  stringToHex,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
  BaseError,
} from 'viem';
import { Mutex } from 'async-mutex';
import { cloneDeep } from 'lodash';
import { Coordinator, CoordinatorSignatureParamsSchema } from './coordinator';
import { InfernetError } from './errors';
import { PaymentWallet } from './paymentWallet';
import { Registry } from './registry';
import { RPC } from './rpc';
import { Wallet } from './wallet';
import { WalletChecker } from './walletChecker';
import { Orchestrator } from '../orchestration/orchestrator';
import {
  ContainerError,
  ContainerErrorSchema,
  ContainerOutput,
  ContainerOutputSchema,
  JobInput,
  JobLocation,
} from '../shared/job';
import {
  DelegatedSubscriptionMessage,
  DelegatedSubscriptionMessageSchema,
  MessageType,
  OnchainMessageSchema,
  SubscriptionCreatedMessageSchema,
} from '../shared/message';
import { AsyncTask } from '../shared/service';
import { Subscription } from '../shared/subscription';
import { ContainerLookup } from './containerLookup';
import { getUnixTimestamp, delay } from '../utils/helpers';
import { HexSchema } from '../shared/schemas';

const IntervalSchema = z.number();

const SubscriptionIDSchema = z.number();

const DelegateSubscriptionIDSchema = z.tuple([HexSchema, z.number()]);

const UnionIDSchema = z.union([
  SubscriptionIDSchema,
  DelegateSubscriptionIDSchema,
]);

const DelegateSubscriptionDataSchema = z.tuple([
  z.instanceof(Subscription),
  CoordinatorSignatureParamsSchema,
  z.record(z.any()),
]);

const MakeDelegateSubscriptionsKeySchema = z
  .function()
  .args(HexSchema, z.number())
  .returns(z.string());

const MakePendingOrAttemptsKeySchema = z
  .function()
  .args(UnionIDSchema, IntervalSchema)
  .returns(z.string());

const ParsePendingOrAttemptsKeySchema = z
  .function()
  .args(z.string())
  .returns(z.tuple([UnionIDSchema, IntervalSchema]));

const ResponseKeysSchema = z.string().array();

type Interval = z.infer<typeof IntervalSchema>;

type SubscriptionID = z.infer<typeof SubscriptionIDSchema>;

type DelegateSubscriptionID = z.infer<typeof DelegateSubscriptionIDSchema>;

type UnionID = z.infer<typeof UnionIDSchema>;

type DelegateSubscriptionData = z.infer<typeof DelegateSubscriptionDataSchema>;

const makeDelegateSubscriptionsKey =
  MakeDelegateSubscriptionsKeySchema.implement(
    (subOwner, sigNonce) => `${subOwner}-${sigNonce}`
  );

const makePendingOrAttemptsKey = MakePendingOrAttemptsKeySchema.implement(
  (id, interval) => {
    const _id = Array.isArray(id)
      ? makeDelegateSubscriptionsKey(id[0], id[1])
      : id;

    return `${_id}-${interval}`;
  }
);

const parsePendingOrAttemptsKey = ParsePendingOrAttemptsKeySchema.implement(
  (key) => {
    const items = key.split('-');

    if (items.length === 2) {
      // Parse key with this format: `${SubscriptionID}-${Interval}`.
      return [Number(items[0]), Number(items[1])];
    } else if (items.length === 3) {
      // Parse key with this format: `${Hex}-${number}-${Interval}`
      return [[items[0] as Hex, Number(items[1])], Number(items[2])];
    }

    throw new Error(`Invalid key: ${key}`);
  }
);

const BLOCKED: z.infer<typeof HexSchema> = '0xblocked';

const RESPONSE_KEYS: z.infer<typeof ResponseKeysSchema> = [
  'raw_input',
  'processed_input',
  'raw_output',
  'processed_output',
  'proof',
];

export class ChainProcessor extends AsyncTask {
  static fieldSchemas = {
    _rpc: z.instanceof(RPC),
    _coordinator: z.instanceof(Coordinator),
    _wallet: z.instanceof(Wallet),
    _payment_wallet: z.instanceof(PaymentWallet),
    _wallet_checker: z.instanceof(WalletChecker),
    _registry: z.instanceof(Registry),
    _orchestrator: z.instanceof(Orchestrator),
    _container_lookup: z.instanceof(ContainerLookup),
    _subscriptions: z.record(z.instanceof(Subscription)),
    _delegate_subscriptions: z.record(DelegateSubscriptionDataSchema),
    _pending: z.record(HexSchema),
    _attempts: z.record(z.number()),
    _attempts_lock: z.custom<Mutex>(),
  };

  static methodSchemas = {
    _track_created_message: z
      .function()
      .args(SubscriptionCreatedMessageSchema)
      .returns(z.void()),
    _track_delegated_message: z
      .function()
      .args(DelegatedSubscriptionMessageSchema)
      .returns(z.promise(z.void())),
    _has_responded_onchain_in_interval: z
      .function()
      .args(SubscriptionIDSchema)
      .returns(z.promise(z.boolean())),
    _prune_failed_txs: z.function().returns(z.promise(z.void())),
    _stop_tracking: z
      .function()
      .args(UnionIDSchema, z.boolean())
      .returns(z.void()),
    _has_subscription_tx_pending_in_interval: z
      .function()
      .args(UnionIDSchema)
      .returns(z.boolean()),
    _serialize_container_output: z
      .function()
      .args(ContainerOutputSchema)
      .returns(z.tuple([HexSchema, HexSchema, HexSchema])),
    _stop_tracking_if_sub_owner_cant_pay: z
      .function()
      .args(SubscriptionIDSchema)
      .returns(z.promise(z.boolean())),
    _stop_tracking_delegated_sub_if_completed: z
      .function()
      .args(DelegateSubscriptionIDSchema)
      .returns(z.promise(z.boolean())),
    _stop_tracking_sub_if_completed: z
      .function()
      .args(z.instanceof(Subscription))
      .returns(z.promise(z.boolean())),
    _stop_tracking_if_maximum_retries_reached: z
      .function()
      .args(z.tuple([UnionIDSchema, IntervalSchema]), z.boolean())
      .returns(z.promise(z.boolean())),
    _stop_tracking_sub_if_missed_deadline: z
      .function()
      .args(UnionIDSchema, z.boolean())
      .returns(z.boolean()),
    _stop_tracking_if_infernet_errors_caught_in_simulation: z
      .function()
      .args(
        z.instanceof(Subscription),
        z.boolean(),
        CoordinatorSignatureParamsSchema.optional()
      )
      .returns(z.promise(z.boolean())),
    _deliver: z
      .function()
      .args(
        z.instanceof(Subscription),
        z.boolean(),
        CoordinatorSignatureParamsSchema.optional(),
        z.boolean(),
        HexSchema.default('0x'),
        HexSchema.default('0x'),
        HexSchema.default('0x')
      )
      .returns(z.promise(HexSchema)),
    _execute_on_containers: z
      .function()
      .args(
        z.instanceof(Subscription),
        z.boolean(),
        z
          .tuple([CoordinatorSignatureParamsSchema, z.record(z.any())])
          .optional()
      )
      .returns(
        z.promise(
          z.union([ContainerOutputSchema, ContainerErrorSchema]).array()
        )
      ),
    _escrow_reward_in_wallet: z
      .function()
      .args(z.instanceof(Subscription))
      .returns(z.promise(z.void())),
    _process_subscription: z
      .function()
      .args(
        UnionIDSchema,
        z.instanceof(Subscription),
        z.boolean(),
        z
          .tuple([CoordinatorSignatureParamsSchema, z.record(z.any())])
          .optional()
      )
      .returns(z.promise(z.void())),
    track: z.function().args(OnchainMessageSchema).returns(z.promise(z.void())),
    run_forever: z.function().returns(z.promise(z.void())),
    setup: z.function().returns(z.void()),
    cleanup: z.function().returns(z.void()),
  };

  #rpc: z.infer<typeof ChainProcessor.fieldSchemas._rpc>;
  #coordinator: z.infer<typeof ChainProcessor.fieldSchemas._coordinator>;
  #wallet: z.infer<typeof ChainProcessor.fieldSchemas._wallet>;
  #payment_wallet: z.infer<typeof ChainProcessor.fieldSchemas._payment_wallet>;
  #wallet_checker: z.infer<typeof ChainProcessor.fieldSchemas._wallet_checker>;
  #registry: z.infer<typeof ChainProcessor.fieldSchemas._registry>;
  #orchestrator: z.infer<typeof ChainProcessor.fieldSchemas._orchestrator>;
  #container_lookup: z.infer<
    typeof ChainProcessor.fieldSchemas._container_lookup
  >;
  #subscriptions: z.infer<typeof ChainProcessor.fieldSchemas._subscriptions>;
  #delegate_subscriptions: z.infer<
    typeof ChainProcessor.fieldSchemas._delegate_subscriptions
  >;
  #pending: z.infer<typeof ChainProcessor.fieldSchemas._pending>;
  #attempts: z.infer<typeof ChainProcessor.fieldSchemas._attempts>;
  #attempts_lock: z.infer<typeof ChainProcessor.fieldSchemas._attempts_lock>;

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

    this.#rpc = ChainProcessor.fieldSchemas._rpc.parse(rpc);
    this.#coordinator =
      ChainProcessor.fieldSchemas._coordinator.parse(coordinator);
    this.#wallet = ChainProcessor.fieldSchemas._wallet.parse(wallet);
    this.#payment_wallet =
      ChainProcessor.fieldSchemas._payment_wallet.parse(payment_wallet);
    this.#wallet_checker =
      ChainProcessor.fieldSchemas._wallet_checker.parse(wallet_checker);
    this.#registry = ChainProcessor.fieldSchemas._registry.parse(registry);
    this.#orchestrator =
      ChainProcessor.fieldSchemas._orchestrator.parse(orchestrator);
    this.#container_lookup =
      ChainProcessor.fieldSchemas._container_lookup.parse(container_lookup);
    this.#subscriptions = ChainProcessor.fieldSchemas._subscriptions.parse({});
    this.#delegate_subscriptions =
      ChainProcessor.fieldSchemas._delegate_subscriptions.parse({});
    this.#pending = ChainProcessor.fieldSchemas._pending.parse({});
    this.#attempts = ChainProcessor.fieldSchemas._attempts.parse({});

    console.info('Initialized ChainProcessor');

    this.#attempts_lock = ChainProcessor.fieldSchemas._attempts_lock.parse(
      new Mutex()
    );
  }

  // Tracks SubscriptionCreatedMessage.
  #track_created_message =
    ChainProcessor.methodSchemas._track_created_message.implement((msg) => {
      this.#subscriptions[msg.subscription.id] = msg.subscription;

      console.info('Tracked new subscription!', {
        id: msg.subscription.id,
        total: Object.keys(this.#subscriptions).length,
      });
    });

  // Tracks DelegatedSubscriptionMessage.
  #track_delegated_message =
    ChainProcessor.methodSchemas._track_delegated_message.implement(
      async (msg) => {
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
            subscription.interval
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

            console.info('Tracked new delegate subscription', {
              sub_id: subId,
            });
          }
        }
      }
    );

  // Checks whether node has responded on-chain in interval (non-pending).
  #has_responded_onchain_in_interval =
    ChainProcessor.methodSchemas._has_responded_onchain_in_interval.implement(
      async (subscription_id) => {
        const sub = this.#subscriptions[subscription_id];
        const subInterval = sub.interval;

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
    );

  // Prunes pending txs that have failed to allow for re-processing.
  #prune_failed_txs = ChainProcessor.methodSchemas._prune_failed_txs.implement(
    async () => {
      const failedTxs: string[] = [];

      await this.#attempts_lock.runExclusive(async () => {
        const pendingCopy = cloneDeep(this.#pending);
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
  );

  // Stops tracking subscription or delegated subscription.
  #stop_tracking = ChainProcessor.methodSchemas._stop_tracking.implement(
    (subscription_id, delegated) => {
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
  );

  // Checks if a subscription (or delegated subscription) has a pending tx for current interval.
  #has_subscription_tx_pending_in_interval =
    ChainProcessor.methodSchemas._has_subscription_tx_pending_in_interval.implement(
      (subscription_id) => {
        let sub;

        // Check whether `subscription_id` is of type `SubscriptionID` (a number).
        if (typeof subscription_id === 'number') {
          sub = this.#subscriptions[subscription_id];
        } else {
          [sub] =
            this.#delegate_subscriptions[
              makeDelegateSubscriptionsKey(
                subscription_id[0],
                subscription_id[1]
              )
            ];
        }

        const pendingKey = makePendingOrAttemptsKey(
          subscription_id,
          sub.interval
        );

        return !!this.#pending[pendingKey];
      }
    );

  // Serializes container output to conform to on-chain fn input.
  #serialize_container_output =
    ChainProcessor.methodSchemas._serialize_container_output.implement(
      (containerOutput) => {
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
              [output['raw_input'], output['processed_input']]
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
              [output['raw_output'], output['processed_output']]
            ),
            output['proof'],
          ];
        }

        return [
          stringToHex(''),
          encodeAbiParameters([{ type: 'string' }], [JSON.stringify(output)]),
          stringToHex(''),
        ];
      }
    );

  // Check if the subscription owner can pay for the subscription. If not, stop tracking the subscription.
  #stop_tracking_if_sub_owner_cant_pay =
    ChainProcessor.methodSchemas._stop_tracking_if_sub_owner_cant_pay.implement(
      async (sub_id) => {
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

        const [hasBalance, balance] =
          await this.#wallet_checker.has_enough_balance(
            sub.wallet,
            sub.payment_token,
            BigInt(sub.payment_amount)
          );

        if (!hasBalance) {
          console.info(
            `${banner}: Subscription wallet has insufficient balance`,
            {
              sub_id: sub.id,
              wallet: sub.wallet,
              sub_amount: sub.payment_amount,
              wallet_balance: balance,
            }
          );

          this.#stop_tracking(sub.id, false);

          return true;
        }

        return false;
      }
    );

  // Check if the subscription has been cancelled on-chain, if so, stop tracking it.
  async #stop_tracking_if_cancelled(sub_id: SubscriptionID): Promise<boolean> {
    const sub: Subscription = await this.#coordinator.get_subscription_by_id(
      sub_id,
      0n
    );

    if (sub.cancelled) {
      console.info('Subscription cancelled', { id: sub_id });

      this.#stop_tracking(sub.id, false);

      return true;
    }

    return false;
  }

  // Check if the delegated subscription has already been completed. If so, stop tracking it.
  #stop_tracking_delegated_sub_if_completed =
    ChainProcessor.methodSchemas._stop_tracking_delegated_sub_if_completed.implement(
      async (sub_id) => {
        const [sub]: DelegateSubscriptionData =
          this.#delegate_subscriptions[
            makeDelegateSubscriptionsKey(sub_id[0], sub_id[1])
          ];
        const txHash =
          this.#pending[makePendingOrAttemptsKey(sub_id, sub.interval)];

        // We have not yet submitted the transaction for this delegated subscription.
        if (!txHash || txHash === BLOCKED) return false;

        const [found, success] = await this.#rpc.get_tx_success_with_retries(
          txHash,
          undefined,
          undefined
        );

        // We have already submitted the transaction and it was successful.
        if (found && success) {
          console.info('Delegated subscription completed for interval', {
            id: sub_id,
            interval: sub.interval,
          });

          this.#stop_tracking(sub_id, true);

          return true;
        }

        return false;
      }
    );

  // Check if the subscription has already been completed. If so, stop tracking it.
  #stop_tracking_sub_if_completed =
    ChainProcessor.methodSchemas._stop_tracking_sub_if_completed.implement(
      async (subscription) => {
        const { id } = subscription;
        const interval = subscription.interval;
        const responseCount =
          await this.#coordinator.get_subscription_response_count(
            id,
            interval,
            0n
          );

        subscription.set_response_count(interval, responseCount);

        if (subscription.completed) {
          console.info('Subscription already completed', {
            id,
            interval,
          });

          this.#stop_tracking(id, false);

          return true;
        }

        return false;
      }
    );

  // Check if the subscription has exceeded the maximum number of attempts. If so, stop tracking it.
  #stop_tracking_if_maximum_retries_reached =
    ChainProcessor.methodSchemas._stop_tracking_if_maximum_retries_reached.implement(
      async (sub_key, delegated) => {
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
    );

  // Check if the subscription has missed the deadline. If so, stop tracking it.
  #stop_tracking_sub_if_missed_deadline =
    ChainProcessor.methodSchemas._stop_tracking_sub_if_missed_deadline.implement(
      (subscription_id, delegated) => {
        let subscription: Subscription;

        if (!delegated && typeof subscription_id === 'number') {
          subscription = this.#subscriptions[subscription_id as SubscriptionID];
        } else {
          [subscription] =
            this.#delegate_subscriptions[
              makeDelegateSubscriptionsKey(
                subscription_id[0],
                subscription_id[1]
              )
            ];
        }

        // Checking if subscription is falsy is necessary because the subscription may have
        // been deleted in `#process_subscription`.
        if (!subscription) return true;

        if (subscription.past_last_interval) {
          console.info('Subscription expired', {
            id: subscription.id,
            interval: subscription.interval,
          });

          this.#stop_tracking(subscription_id, delegated);

          return true;
        }

        return false;
      }
    );

  // Simulate a deliver compute tx, and stop tracking if it reverts with an infernet-related error.
  #stop_tracking_if_infernet_errors_caught_in_simulation =
    ChainProcessor.methodSchemas._stop_tracking_if_infernet_errors_caught_in_simulation.implement(
      async (subscription, delegated, signature) => {
        if (subscription.requires_proof) return false;

        try {
          await this.#deliver(
            subscription,
            delegated,
            signature,
            true,
            undefined,
            undefined,
            undefined
          );
        } catch (err) {
          if (err instanceof InfernetError && subscription.is_callback) {
            this.#stop_tracking(subscription.id, delegated);

            return true;
          }
        }

        return false;
      }
    );

  // Deliver the compute to the chain.
  #deliver = ChainProcessor.methodSchemas._deliver.implement(
    async (
      subscription,
      delegated,
      signature,
      simulate_only,
      input,
      output,
      proof
    ) => {
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
  );

  // Execute containers for the subscription.
  #execute_on_containers =
    ChainProcessor.methodSchemas._execute_on_containers.implement(
      async (subscription, delegated, delegated_params) => {
        let containerInput: JobInput;

        if (delegated && delegated_params) {
          containerInput = {
            source: JobLocation.OFFCHAIN,
            destination: JobLocation.ONCHAIN,
            data: delegated_params[1],
          };
        } else {
          const chainInput: Hex = await this.#coordinator.get_container_inputs(
            subscription,
            subscription.interval,
            getUnixTimestamp(),
            this.#wallet.address
          );

          containerInput = {
            source: JobLocation.ONCHAIN,
            destination: JobLocation.ONCHAIN,
            data: chainInput,
          };
        }

        console.debug('Setup container input', {
          id: subscription.id,
          interval: subscription.interval,
          input: containerInput,
        });

        return this.#orchestrator.process_chain_processor_job(
          subscription.id,
          containerInput,
          subscription.containers,
          subscription.requires_proof
        );
      }
    );

  #escrow_reward_in_wallet =
    ChainProcessor.methodSchemas._escrow_reward_in_wallet.implement(
      async (subscription) => {
        console.info('Escrowing reward in wallet', {
          id: subscription.id,
          token: subscription.payment_token,
          amount: subscription.payment_amount,
          spender: this.#registry.coordinator,
        });

        await this.#payment_wallet.approve(
          this.#rpc.account,
          subscription.payment_token,
          BigInt(subscription.payment_amount)
        );
      }
    );

  // Processes subscription (collects inputs, runs containers, posts output on-chain).
  #process_subscription =
    ChainProcessor.methodSchemas._process_subscription.implement(
      async (id, subscription, delegated, delegated_params) => {
        const interval = subscription.interval;

        console.info('Processing subscription', {
          id,
          interval,
          delegated,
        });

        // Check if we missed the subscription deadline.
        if (await this.#stop_tracking_sub_if_missed_deadline(id, delegated))
          return;

        const pendingKey = makePendingOrAttemptsKey(id, interval);
        this.#pending[pendingKey] = BLOCKED;

        if (
          await this.#stop_tracking_if_infernet_errors_caught_in_simulation(
            subscription,
            delegated,
            delegated_params ? delegated_params[0] : undefined
          )
        )
          return;

        const containerResults = await this.#execute_on_containers(
          subscription,
          delegated,
          delegated_params
        );

        // Check if some container response received. If none, prevent blocking pending queue and return.
        if (!containerResults.length) {
          console.error('Container results empty', { id, interval });

          delete this.#pending[pendingKey];

          return;
        }

        const lastResult = containerResults.pop() as
          | ContainerError
          | ContainerOutput;
        const subscriptionIsCallback = subscription.is_callback;

        // Check for container error. If error, prevent blocking pending queue and return.
        if ('error' in lastResult) {
          console.error('Container execution errored', {
            id,
            interval,
            err: lastResult,
          });

          delete this.#pending[pendingKey];

          if (subscriptionIsCallback)
            this.#stop_tracking(subscription.id, delegated);

          return;
        } else if (lastResult.output.code && lastResult.output.code !== '200') {
          console.error('Container execution errored', {
            id,
            interval,
            err: lastResult,
          });

          delete this.#pending[pendingKey];

          if (subscriptionIsCallback)
            this.#stop_tracking(subscription.id, delegated);

          return;
        } else {
          console.info('Container execution succeeded', { id, interval });
          console.debug('Container output', { last_result: lastResult });
        }

        if (subscription.requires_proof)
          await this.#escrow_reward_in_wallet(subscription);

        const [input, output, proof] =
          this.#serialize_container_output(lastResult);

        let txHash;

        try {
          txHash = await this.#deliver(
            subscription,
            delegated,
            delegated && delegated_params ? delegated_params[0] : undefined,
            false,
            input,
            output,
            proof
          );
        } catch (err: any) {
          let revertError;

          if (err instanceof BaseError)
            revertError = err.walk(
              (err) =>
                err instanceof ContractFunctionRevertedError ||
                err instanceof ContractFunctionExecutionError
            );

          // Transaction simulation failed. If it's a callback subscription, we can stop tracking it
          // delegated subscriptions will expire instead.
          if (err instanceof InfernetError || revertError) {
            if (subscriptionIsCallback)
              this.#stop_tracking(subscription.id, delegated);

            console.info('Did not send tx', {
              subscription,
              id,
              interval,
              delegated,
            });

            return;
          } else {
            console.error(`Failed to send tx ${err}`, {
              subscription,
              id,
              interval,
              delegated,
            });

            if (subscriptionIsCallback)
              this.#stop_tracking(subscription.id, delegated);

            return;
          }
        }

        this.#pending[pendingKey] = txHash;

        console.info('Sent tx', { id, interval, delegated, tx_hash: txHash });
      }
    );

  // Tracks incoming message by type.
  track = ChainProcessor.methodSchemas.track.implement(async (msg) => {
    switch (msg.type) {
      case MessageType.SubscriptionCreated:
        this.#track_created_message(msg);

        break;
      case MessageType.DelegatedSubscription:
        await this.#track_delegated_message(
          msg as DelegatedSubscriptionMessage
        );

        break;
      default:
        console.error('Unknown message type to track', { message: msg });
    }
  });

  // Core ChainProcessor event loop.
  run_forever = ChainProcessor.methodSchemas.run_forever.implement(async () => {
    while (!this.shutdown) {
      this.#prune_failed_txs();

      for (const subId in this.#subscriptions) {
        const subscriptionId = parseInt(subId);
        const subscription: Subscription = this.#subscriptions[subId];

        // Checks if sub owner has a valid wallet & enough funds.
        if (await this.#stop_tracking_if_sub_owner_cant_pay(subscriptionId))
          continue;

        // Since cancellation means `Subscription.active_at === UINT32_MAX`, we should
        // check if the subscription is cancelled before checking activation.
        if (await this.#stop_tracking_if_cancelled(subscriptionId)) continue;

        // Skips if subscription is not active.
        if (!subscription.active) {
          console.info('Ignored inactive subscription', {
            id: subId,
            diff: subscription.active_at - getUnixTimestamp(),
          });

          continue;
        }

        if (await this.#stop_tracking_sub_if_completed(subscription)) continue;
        if (this.#stop_tracking_sub_if_missed_deadline(subscriptionId, false))
          continue;
        if (
          await this.#stop_tracking_if_maximum_retries_reached(
            [subscriptionId, subscription.interval],
            false
          )
        )
          continue;

        // Check if subscription needs processing.
        // 1. Response for current interval must not be in pending queue.
        // 2. Response for current interval must not have already been confirmed on-chain.
        if (
          !this.#has_subscription_tx_pending_in_interval(subscriptionId) &&
          !(await this.#has_responded_onchain_in_interval(subscriptionId))
        ) {
          this.#process_subscription(
            subscriptionId,
            subscription,
            false,
            undefined
          );
        }
      }

      // Make deep copy to avoid mutation during iteration.
      const delegateSubscriptionsCopy: {
        [key: string]: DelegateSubscriptionData;
      } = cloneDeep(this.#delegate_subscriptions);

      for (const delegateSubscriptionId in delegateSubscriptionsCopy) {
        const parsedDelegateSubscriptionId = delegateSubscriptionId.split('-');
        const [subOwner, sigNonce]: DelegateSubscriptionID = [
          parsedDelegateSubscriptionId[0] as Hex,
          parseInt(parsedDelegateSubscriptionId[1]),
        ];
        const subscription: Subscription =
          delegateSubscriptionsCopy[delegateSubscriptionId][0];

        if (!subscription.active) {
          console.debug('Ignored inactive subscription', {
            id: delegateSubscriptionId,
            diff: subscription.active_at - getUnixTimestamp(),
          });

          continue;
        }

        if (
          await this.#stop_tracking_delegated_sub_if_completed([
            subOwner,
            sigNonce,
          ])
        )
          continue;

        if (
          await this.#stop_tracking_if_maximum_retries_reached(
            [[subOwner, sigNonce], subscription.interval],
            true
          )
        )
          continue;

        // Check if subscription needs processing
        // 1. Response for current interval must not be in pending queue
        // Unlike subscriptions, delegate subscriptions cannot have already
        // confirmed on-chain txs, since those would be tracked by their
        // on-chain ID and not as a delegate subscription
        if (
          !this.#has_subscription_tx_pending_in_interval([subOwner, sigNonce])
        ) {
          this.#process_subscription([subOwner, sigNonce], subscription, true, [
            delegateSubscriptionsCopy[delegateSubscriptionId][1],
            delegateSubscriptionsCopy[delegateSubscriptionId][2],
          ]);
        }
      }

      await delay(100);
    }
  });

  setup = ChainProcessor.methodSchemas.setup.implement(() => {});

  cleanup = ChainProcessor.methodSchemas.cleanup.implement(() => {});
}
