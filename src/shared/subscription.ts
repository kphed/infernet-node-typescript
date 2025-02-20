// Reference: https://github.com/ritual-net/infernet-node/blob/7418dff0b55ba85c27b8764529f5e5f0aa9cbdb3/src/shared/subscription.py.
import { z } from 'zod';
import { Address, Hex, getAddress, hashTypedData } from 'viem';
import { ChecksumAddressSchema, ByteStringSchema } from './schemas';
import { ContainerLookup } from '../chain/containerLookup';
import { UINT32_MAX, ZERO_ADDRESS } from '../utils/constants';
import { add0x, getUnixTimestamp } from '../utils/helpers';

export class Subscription {
  static fieldSchemas = {
    id: z.number(),
    payment_amount: z.number(),
    payment_token: ChecksumAddressSchema,
    verifier: ChecksumAddressSchema,
    owner: ChecksumAddressSchema,
    containers_hash: ByteStringSchema,
    wallet: ChecksumAddressSchema,
    active_at: z.number(),
    _container_lookup: z.instanceof(ContainerLookup),
    _period: z.number(),
    _frequency: z.number(),
    _redundancy: z.number(),
    _lazy: z.boolean(),
    _responses: z.object({}).catchall(z.number()),
    _node_replied: z.object({}).catchall(z.boolean()),
  };

  id: z.infer<typeof Subscription.fieldSchemas.id>;
  payment_amount: z.infer<typeof Subscription.fieldSchemas.payment_amount>;
  payment_token: z.infer<typeof Subscription.fieldSchemas.payment_token>;
  verifier: z.infer<typeof Subscription.fieldSchemas.verifier>;
  owner: z.infer<typeof Subscription.fieldSchemas.owner>;
  containers_hash: z.infer<typeof Subscription.fieldSchemas.containers_hash>;
  wallet: z.infer<typeof Subscription.fieldSchemas.wallet>;
  active_at: z.infer<typeof Subscription.fieldSchemas.active_at>;
  #container_lookup: z.infer<
    typeof Subscription.fieldSchemas._container_lookup
  >;
  #period: z.infer<typeof Subscription.fieldSchemas._period>;
  #frequency: z.infer<typeof Subscription.fieldSchemas._frequency>;
  #redundancy: z.infer<typeof Subscription.fieldSchemas._redundancy>;
  #lazy: z.infer<typeof Subscription.fieldSchemas._lazy>;
  #responses: z.infer<typeof Subscription.fieldSchemas._responses>;
  #node_replied: z.infer<typeof Subscription.fieldSchemas._node_replied>;

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
    this.payment_amount =
      Subscription.fieldSchemas.payment_amount.parse(payment_amount);
    this.payment_token =
      Subscription.fieldSchemas.payment_token.parse(payment_token);
    this.verifier = Subscription.fieldSchemas.verifier.parse(
      getAddress(verifier)
    );
    this.owner = Subscription.fieldSchemas.owner.parse(getAddress(owner));
    this.containers_hash = Subscription.fieldSchemas.containers_hash.parse(
      add0x(containers_hash)
    );
    this.wallet = Subscription.fieldSchemas.wallet.parse(getAddress(wallet));
    this.active_at = Subscription.fieldSchemas.active_at.parse(active_at);
    this.#container_lookup =
      Subscription.fieldSchemas._container_lookup.parse(container_lookup);
    this.#period = Subscription.fieldSchemas._period.parse(period);
    this.#frequency = Subscription.fieldSchemas._frequency.parse(frequency);
    this.#redundancy = Subscription.fieldSchemas._redundancy.parse(redundancy);
    this.#lazy = Subscription.fieldSchemas._lazy.parse(lazy);
    this.#responses = Subscription.fieldSchemas._responses.parse({});
    this.#node_replied = Subscription.fieldSchemas._node_replied.parse({});
  }

  /**
   * Returns whether a subscription is active.
   */
  active(): boolean {
    return getUnixTimestamp() > this.active_at;
  }

  /**
   * Returns whether a subscription is cancelled.
   */
  cancelled(): boolean {
    return this.active_at === UINT32_MAX;
  }

  /**
   * Returns whether a subscription is past its last interval.
   */
  past_last_interval(): boolean {
    if (!this.active()) return false;

    return this.interval() > this.#frequency;
  }

  /**
   * Returns whether a subscription is a callback subscription (i.e. period = 0).
   */
  is_callback(): boolean {
    return this.#period === 0;
  }

  /**
   * Returns subscription interval based on active_at and period.
   */
  interval(): number {
    // Throw if checking interval for an inactive subscription.
    if (!this.active())
      throw new Error('Checking interval for inactive subscription');

    // If period is 0, we're always at interval 1.
    if (!this.#period) return 1;

    return Math.floor((getUnixTimestamp() - this.active_at) / this.#period) + 1;
  }

  /**
   * Returns subscription container IDs.
   */
  containers(): string[] {
    return this.#container_lookup.get_containers(this.containers_hash);
  }

  /**
   * Returns whether a subscription requires proof.
   */
  requires_proof(): boolean {
    return this.verifier !== ZERO_ADDRESS;
  }

  /**
   * Returns whether a subscription requires payment.
   */
  provides_payment(): boolean {
    return this.payment_amount > 0;
  }

  /**
   * Returns whether a subscription is on its last interval.
   */
  last_interval(): boolean {
    if (!this.active()) return false;

    return this.interval() === this.#frequency;
  }

  /**
   * Returns whether subscription is completed.
   */
  completed(): boolean {
    if (
      (this.past_last_interval() || this.last_interval()) &&
      this.get_response_count(this.#frequency) === this.#redundancy
    )
      return true;

    return false;
  }

  /**
   * Returns response count by subscription interval.
   */
  get_response_count(interval: number): number {
    const response = this.#responses[interval];

    // If interval is not tracked, return 0.
    if (!response) return 0;

    return response;
  }

  /**
   * Sets response count for a subscription interval.
   */
  set_response_count(interval: number, count: number): void {
    // Throw if updating response count for inactive subscription.
    if (!this.active())
      throw new Error('Cannot update response count for inactive subscription');

    // Throw if updating response count for a future interval.
    if (interval > this.interval())
      throw new Error('Cannot update response count for future interval');

    this.#responses[interval] = count;
  }

  /**
   * Returns whether local node has responded in interval.
   */
  get_node_replied(interval: number): boolean {
    // True if node has replied in interval, else False.
    return !!this.#node_replied[interval];
  }

  /**
   * Sets local node as having responded in interval.
   */
  set_node_replied(interval: number): void {
    this.#node_replied[interval] = true;
  }

  /**
   * Generates EIP-712 typed data to sign for DelegateeSubscription.
   */
  get_delegate_subscription_typed_data(
    nonce: number,
    expiry: number,
    chain_id: number,
    verifying_contract: Address
  ): Hex {
    return hashTypedData({
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
          activeAt: this.active_at,
          period: this.#period,
          frequency: this.#frequency,
          redundancy: this.#redundancy,
          containerId: this.containers_hash as `0x${string}`,
          lazy: this.#lazy,
          verifier: this.verifier,
          paymentAmount: BigInt(this.payment_amount),
          paymentToken: this.payment_token,
          wallet: this.wallet,
        },
      },
    });
  }

  /**
   * Returns subscription parameters as raw array input for generated txs.
   */
  get_tx_inputs(): [
    string,
    number,
    number,
    number,
    number,
    string,
    boolean,
    string,
    number,
    string,
    string
  ] {
    return [
      this.owner,
      this.active_at,
      this.#period,
      this.#frequency,
      this.#redundancy,
      this.containers_hash,
      this.#lazy,
      this.verifier,
      this.payment_amount,
      this.payment_token,
      this.wallet,
    ];
  }
}

export class SerializedSubscription {
  constructor(
    public owner: Address,
    public active_at: number,
    public period: number,
    public frequency: number,
    public redundancy: number,
    public containers: string,
    public lazy: boolean,
    public verifier: string,
    public payment_amount: number,
    public payment_token: string,
    public wallet: string
  ) {}

  deserialize(container_lookup: ContainerLookup): Subscription {
    return new Subscription(
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
    );
  }
}
