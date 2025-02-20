// Reference: https://github.com/ritual-net/infernet-node/blob/7418dff0b55ba85c27b8764529f5e5f0aa9cbdb3/src/shared/subscription.py.
import { z } from 'zod';
import { getAddress, hashTypedData } from 'viem';
import { ChecksumAddressSchema, HexSchema } from './schemas';
import { ContainerLookup } from '../chain/containerLookup';
import { UINT32_MAX, ZERO_ADDRESS } from '../utils/constants';
import { add0x, getUnixTimestamp } from '../utils/helpers';

export class Subscription {
  static fieldSchemas = {
    id: z.number(),
    _container_lookup: z.instanceof(ContainerLookup),
    _owner: ChecksumAddressSchema,
    _active_at: z.number(),
    _period: z.number(),
    _frequency: z.number(),
    _redundancy: z.number(),
    _containers_hash: HexSchema,
    _lazy: z.boolean(),
    _verifier: ChecksumAddressSchema,
    _payment_amount: z.number(),
    _payment_token: ChecksumAddressSchema,
    _wallet: ChecksumAddressSchema,
    _responses: z.object({}).catchall(z.number()),
    _node_replied: z.object({}).catchall(z.boolean()),
    _cached_delegate_subscription_typed_data: z.object({}).catchall(z.any()),
  };

  static methodSchemas = {
    active_at: {
      returns: z.number(),
    },
    active: {
      returns: z.boolean(),
    },
    cancelled: {
      returns: z.boolean(),
    },
    owner: {
      returns: ChecksumAddressSchema,
    },
    past_last_interval: {
      returns: z.boolean(),
    },
    is_callback: {
      returns: z.boolean(),
    },
    interval: {
      returns: z.number(),
    },
    containers: {
      returns: z.string().array(),
    },
    containers_hash: {
      returns: HexSchema,
    },
    payment_amount: {
      returns: z.number(),
    },
    payment_token: {
      returns: ChecksumAddressSchema,
    },
    verifier: {
      returns: ChecksumAddressSchema,
    },
    requires_proof: {
      returns: z.boolean(),
    },
    provides_payment: {
      returns: z.boolean(),
    },
    wallet: {
      returns: ChecksumAddressSchema,
    },
    last_interval: {
      returns: z.boolean(),
    },
    completed: {
      returns: z.boolean(),
    },
    get_response_count: {
      args: {
        interval: z.number(),
      },
      returns: z.number(),
    },
    set_response_count: {
      args: {
        interval: z.number(),
        count: z.number(),
      },
      returns: z.void(),
    },
    get_node_replied: {
      args: {
        interval: z.number(),
      },
      returns: z.boolean(),
    },
    set_node_replied: {
      args: {
        interval: z.number(),
      },
      returns: z.void(),
    },
    get_delegate_subscription_typed_data: {
      args: {
        nonce: z.number(),
        expiry: z.number(),
        chain_id: z.number(),
        verifying_contract: ChecksumAddressSchema,
      },
      returns: HexSchema,
    },
    get_tx_inputs: {
      returns: z.tuple([
        z.string(),
        z.number(),
        z.number(),
        z.number(),
        z.number(),
        HexSchema,
        z.boolean(),
        z.string(),
        z.number(),
        z.string(),
        z.string(),
      ]),
    },
  };

  id: z.infer<typeof Subscription.fieldSchemas.id>;
  #container_lookup: z.infer<
    typeof Subscription.fieldSchemas._container_lookup
  >;
  #owner: z.infer<typeof Subscription.fieldSchemas._owner>;
  #active_at: z.infer<typeof Subscription.fieldSchemas._active_at>;
  #period: z.infer<typeof Subscription.fieldSchemas._period>;
  #frequency: z.infer<typeof Subscription.fieldSchemas._frequency>;
  #redundancy: z.infer<typeof Subscription.fieldSchemas._redundancy>;
  #containers_hash: z.infer<typeof Subscription.fieldSchemas._containers_hash>;
  #lazy: z.infer<typeof Subscription.fieldSchemas._lazy>;
  #verifier: z.infer<typeof Subscription.fieldSchemas._verifier>;
  #payment_amount: z.infer<typeof Subscription.fieldSchemas._payment_amount>;
  #payment_token: z.infer<typeof Subscription.fieldSchemas._payment_token>;
  #wallet: z.infer<typeof Subscription.fieldSchemas._wallet>;
  #responses: z.infer<typeof Subscription.fieldSchemas._responses>;
  #node_replied: z.infer<typeof Subscription.fieldSchemas._node_replied>;
  #cached_delegate_subscription_typed_data: z.infer<
    typeof Subscription.fieldSchemas._cached_delegate_subscription_typed_data
  >;

  constructor(
    id,
    container_lookup,
    owner,
    active_at,
    period,
    frequency,
    redundancy,
    containers_hash,
    lazy,
    verifier,
    payment_amount,
    payment_token,
    wallet
  ) {
    this.id = Subscription.fieldSchemas.id.parse(id);
    this.#container_lookup =
      Subscription.fieldSchemas._container_lookup.parse(container_lookup);
    this.#owner = Subscription.fieldSchemas._owner.parse(getAddress(owner));
    this.#active_at = Subscription.fieldSchemas._active_at.parse(active_at);
    this.#period = Subscription.fieldSchemas._period.parse(period);
    this.#frequency = Subscription.fieldSchemas._frequency.parse(frequency);
    this.#redundancy = Subscription.fieldSchemas._redundancy.parse(redundancy);
    this.#containers_hash = Subscription.fieldSchemas._containers_hash.parse(
      add0x(containers_hash)
    );
    this.#lazy = Subscription.fieldSchemas._lazy.parse(lazy);
    this.#verifier = Subscription.fieldSchemas._verifier.parse(
      getAddress(verifier)
    );
    this.#payment_amount =
      Subscription.fieldSchemas._payment_amount.parse(payment_amount);
    this.#payment_token =
      Subscription.fieldSchemas._payment_token.parse(payment_token);
    this.#wallet = Subscription.fieldSchemas._wallet.parse(getAddress(wallet));
    this.#responses = Subscription.fieldSchemas._responses.parse({});
    this.#node_replied = Subscription.fieldSchemas._node_replied.parse({});
    this.#cached_delegate_subscription_typed_data =
      Subscription.fieldSchemas._cached_delegate_subscription_typed_data.parse(
        {}
      );
  }

  // Returns the time at which the subscription became active.
  get active_at(): z.infer<
    typeof Subscription.methodSchemas.active_at.returns
  > {
    return Subscription.methodSchemas.active_at.returns.parse(this.#active_at);
  }

  // Returns whether a subscription is active.
  get active(): z.infer<typeof Subscription.methodSchemas.active.returns> {
    return Subscription.methodSchemas.active.returns.parse(
      getUnixTimestamp() > this.#active_at
    );
  }

  // Returns whether a subscription is cancelled.
  get cancelled(): z.infer<
    typeof Subscription.methodSchemas.cancelled.returns
  > {
    return Subscription.methodSchemas.cancelled.returns.parse(
      this.#active_at === UINT32_MAX
    );
  }

  // Returns subscription owner.
  get owner(): z.infer<typeof Subscription.methodSchemas.owner.returns> {
    return Subscription.methodSchemas.owner.returns.parse(this.#owner);
  }

  // Returns whether a subscription is past its last interval.
  get past_last_interval(): z.infer<
    typeof Subscription.methodSchemas.past_last_interval.returns
  > {
    return Subscription.methodSchemas.past_last_interval.returns.parse(
      !this.active ? false : this.interval > this.#frequency
    );
  }

  // Returns whether a subscription is a callback subscription (i.e. period = 0).
  get is_callback(): z.infer<
    typeof Subscription.methodSchemas.is_callback.returns
  > {
    return Subscription.methodSchemas.is_callback.returns.parse(
      this.#period === 0
    );
  }

  // Returns subscription interval based on `active_at` and `period`.
  get interval(): z.infer<typeof Subscription.methodSchemas.interval.returns> {
    // Throw if checking interval for an inactive subscription.
    if (!this.active)
      throw new Error('Checking interval for inactive subscription');

    return Subscription.methodSchemas.interval.returns.parse(
      // If period is 0, we're always at interval 1.
      this.#period === 0
        ? 1
        : Math.floor((getUnixTimestamp() - this.#active_at) / this.#period) + 1
    );
  }

  // Returns subscription container IDs.
  get containers(): z.infer<
    typeof Subscription.methodSchemas.containers.returns
  > {
    return Subscription.methodSchemas.containers.returns.parse(
      this.#container_lookup.get_containers(this.containers_hash)
    );
  }

  // Returns the subscription container IDs hash.
  get containers_hash(): z.infer<
    typeof Subscription.methodSchemas.containers_hash.returns
  > {
    return Subscription.methodSchemas.containers_hash.returns.parse(
      this.#containers_hash
    );
  }

  // Returns the subscription payment amount.
  get payment_amount(): z.infer<
    typeof Subscription.methodSchemas.payment_amount.returns
  > {
    return Subscription.methodSchemas.payment_amount.returns.parse(
      this.#payment_amount
    );
  }

  // Returns the subscription payment token.
  get payment_token(): z.infer<
    typeof Subscription.methodSchemas.payment_token.returns
  > {
    return Subscription.methodSchemas.payment_token.returns.parse(
      this.#payment_token
    );
  }

  // Returns subscription verifier address.
  get verifier(): z.infer<typeof Subscription.methodSchemas.verifier.returns> {
    return Subscription.methodSchemas.verifier.returns.parse(this.#verifier);
  }

  // Returns whether a subscription requires proof.
  get requires_proof(): z.infer<
    typeof Subscription.methodSchemas.requires_proof.returns
  > {
    return Subscription.methodSchemas.requires_proof.returns.parse(
      this.verifier !== ZERO_ADDRESS
    );
  }

  // Returns whether a subscription requires payment.
  get provides_payment(): z.infer<
    typeof Subscription.methodSchemas.provides_payment.returns
  > {
    return Subscription.methodSchemas.provides_payment.returns.parse(
      this.payment_amount > 0
    );
  }

  // Returns the subscription wallet address.
  get wallet(): z.infer<typeof Subscription.methodSchemas.wallet.returns> {
    return Subscription.methodSchemas.wallet.returns.parse(this.#wallet);
  }

  // Returns whether a subscription is on its last interval.
  get last_interval(): z.infer<
    typeof Subscription.methodSchemas.last_interval.returns
  > {
    return Subscription.methodSchemas.last_interval.returns.parse(
      !this.active ? false : this.interval === this.#frequency
    );
  }

  // Returns whether subscription is completed.
  get completed(): z.infer<
    typeof Subscription.methodSchemas.completed.returns
  > {
    // Return true if subscription is on its last interval, and has received its max redundancy responses.
    return Subscription.methodSchemas.completed.returns.parse(
      (this.past_last_interval || this.last_interval) &&
        this.get_response_count(this.#frequency) === this.#redundancy
    );
  }

  // Returns response count by subscription interval.
  get_response_count(
    interval: z.infer<
      typeof Subscription.methodSchemas.get_response_count.args.interval
    >
  ): z.infer<typeof Subscription.methodSchemas.get_response_count.returns> {
    return Subscription.methodSchemas.get_response_count.returns.parse(
      this.#responses[interval] ?? 0
    );
  }

  // Sets response count for a subscription interval.
  set_response_count(
    interval: z.infer<
      typeof Subscription.methodSchemas.set_response_count.args.interval
    >,
    count: z.infer<
      typeof Subscription.methodSchemas.set_response_count.args.count
    >
  ): z.infer<typeof Subscription.methodSchemas.set_response_count.returns> {
    // Throw if updating response count for inactive subscription.
    if (!this.active)
      throw new Error('Cannot update response count for inactive subscription');

    // Throw if updating response count for a future interval.
    if (interval > this.interval)
      throw new Error('Cannot update response count for future interval');

    this.#responses[interval] = count;
  }

  // Returns whether local node has responded within the interval.
  get_node_replied(
    interval: z.infer<
      typeof Subscription.methodSchemas.get_node_replied.args.interval
    >
  ): z.infer<typeof Subscription.methodSchemas.get_node_replied.returns> {
    return Subscription.methodSchemas.get_node_replied.returns.parse(
      !!this.#node_replied[interval]
    );
  }

  // Sets a local node as having responded within the interval.
  set_node_replied(
    interval: z.infer<
      typeof Subscription.methodSchemas.set_node_replied.args.interval
    >
  ): z.infer<typeof Subscription.methodSchemas.set_node_replied.returns> {
    this.#node_replied[interval] = true;
  }

  // Generates EIP-712 typed data to sign for `DelegateeSubscription`.
  get_delegate_subscription_typed_data(
    nonce: z.infer<
      typeof Subscription.methodSchemas.get_delegate_subscription_typed_data.args.nonce
    >,
    expiry: z.infer<
      typeof Subscription.methodSchemas.get_delegate_subscription_typed_data.args.expiry
    >,
    chain_id: z.infer<
      typeof Subscription.methodSchemas.get_delegate_subscription_typed_data.args.chain_id
    >,
    verifying_contract: z.infer<
      typeof Subscription.methodSchemas.get_delegate_subscription_typed_data.args.verifying_contract
    >
  ): z.infer<
    typeof Subscription.methodSchemas.get_delegate_subscription_typed_data.returns
  > {
    const cacheKey = JSON.stringify([
      nonce,
      expiry,
      chain_id,
      verifying_contract,
    ]);

    if (!this.#cached_delegate_subscription_typed_data[cacheKey])
      this.#cached_delegate_subscription_typed_data[cacheKey] =
        Subscription.methodSchemas.get_delegate_subscription_typed_data.returns.parse(
          hashTypedData({
            domain: {
              name: 'InfernetCoordinator',
              version: '1',
              chainId: BigInt(chain_id),
              verifyingContract: verifying_contract,
            },
            types: {
              EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
              ],
              DelegateSubscription: [
                { name: 'nonce', type: 'uint32' },
                { name: 'expiry', type: 'uint32' },
                { name: 'sub', type: 'Subscription' },
              ],
              Subscription: [
                { name: 'owner', type: 'address' },
                { name: 'activeAt', type: 'uint32' },
                { name: 'period', type: 'uint32' },
                { name: 'frequency', type: 'uint32' },
                { name: 'redundancy', type: 'uint16' },
                { name: 'containerId', type: 'bytes32' },
                { name: 'lazy', type: 'bool' },
                { name: 'verifier', type: 'address' },
                { name: 'paymentAmount', type: 'uint256' },
                { name: 'paymentToken', type: 'address' },
                { name: 'wallet', type: 'address' },
              ],
            },
            primaryType: 'DelegateSubscription',
            message: {
              nonce,
              expiry,
              sub: {
                owner: this.owner,
                activeAt: this.#active_at,
                period: this.#period,
                frequency: this.#frequency,
                redundancy: this.#redundancy,
                containerId: this.containers_hash,
                lazy: this.#lazy,
                verifier: this.verifier,
                paymentAmount: BigInt(this.payment_amount),
                paymentToken: this.payment_token,
                wallet: this.wallet,
              },
            },
          })
        );

    return this.#cached_delegate_subscription_typed_data[cacheKey];
  }

  // Returns subscription parameters as raw array input for generated txs.
  get_tx_inputs(): z.infer<
    typeof Subscription.methodSchemas.get_tx_inputs.returns
  > {
    return Subscription.methodSchemas.get_tx_inputs.returns.parse([
      this.owner,
      this.#active_at,
      this.#period,
      this.#frequency,
      this.#redundancy,
      this.containers_hash,
      this.#lazy,
      this.verifier,
      this.payment_amount,
      this.payment_token,
      this.wallet,
    ]);
  }
}

export class SerializedSubscription {
  static methodSchemas = {
    deserialize: {
      args: {
        container_lookup: Subscription.fieldSchemas._container_lookup,
      },
      returns: z.instanceof(Subscription),
    },
  };

  owner: z.infer<typeof Subscription.fieldSchemas._owner>;
  active_at: z.infer<typeof Subscription.fieldSchemas._active_at>;
  period: z.infer<typeof Subscription.fieldSchemas._period>;
  frequency: z.infer<typeof Subscription.fieldSchemas._frequency>;
  redundancy: z.infer<typeof Subscription.fieldSchemas._redundancy>;
  containers: z.infer<typeof Subscription.fieldSchemas._containers_hash>;
  lazy: z.infer<typeof Subscription.fieldSchemas._lazy>;
  verifier: z.infer<typeof Subscription.fieldSchemas._verifier>;
  payment_amount: z.infer<typeof Subscription.fieldSchemas._payment_amount>;
  payment_token: z.infer<typeof Subscription.fieldSchemas._payment_token>;
  wallet: z.infer<typeof Subscription.fieldSchemas._wallet>;

  constructor(
    owner,
    active_at,
    period,
    frequency,
    redundancy,
    containers,
    lazy,
    verifier,
    payment_amount,
    payment_token,
    wallet
  ) {
    this.owner = Subscription.fieldSchemas._owner.parse(owner);
    this.active_at = Subscription.fieldSchemas._active_at.parse(active_at);
    this.period = Subscription.fieldSchemas._period.parse(period);
    this.frequency = Subscription.fieldSchemas._frequency.parse(frequency);
    this.redundancy = Subscription.fieldSchemas._redundancy.parse(redundancy);
    this.containers =
      Subscription.fieldSchemas._containers_hash.parse(containers);
    this.lazy = Subscription.fieldSchemas._lazy.parse(lazy);
    this.verifier = Subscription.fieldSchemas._verifier.parse(verifier);
    this.payment_amount =
      Subscription.fieldSchemas._payment_amount.parse(payment_amount);
    this.payment_token =
      Subscription.fieldSchemas._payment_token.parse(payment_token);
    this.wallet = Subscription.fieldSchemas._wallet.parse(wallet);
  }

  deserialize(
    container_lookup: z.infer<
      typeof SerializedSubscription.methodSchemas.deserialize.args.container_lookup
    >
  ): z.infer<typeof SerializedSubscription.methodSchemas.deserialize.returns> {
    return SerializedSubscription.methodSchemas.deserialize.returns.parse(
      new Subscription(
        -1,
        container_lookup,
        this.owner,
        this.active_at,
        this.period,
        this.frequency,
        this.redundancy,
        this.containers,
        this.lazy,
        this.verifier,
        this.payment_amount,
        this.payment_token,
        this.wallet
      )
    );
  }
}
