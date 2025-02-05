// Reference: https://github.com/ritual-net/infernet-node/blob/7418dff0b55ba85c27b8764529f5e5f0aa9cbdb3/src/shared/subscription.py.
import { Address, SignableMessage, getAddress, hashTypedData } from 'viem';
import { ContainerLookup } from '../chain/containerLookup';

// 2 ** 32 - 1;
const UINT32_MAX = 4294967295;

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const add0x = (hash: string): `0x${string}` => {
  if (hash.substring(0, 2) === '0x') return hash as `0x${string}`;

  return `0x${hash}`;
};

const getUnixTimestamp = (): number => {
  return Math.floor(new Date().getTime() / 1_000);
};

class Subscription {
  id: number;
  #owner: string;
  #container_lookup: ContainerLookup;
  #active_at: number;
  #period: number;
  #frequency: number;
  #redundancy: number;
  #containers_hash: Buffer;
  #lazy: boolean;
  #verifier: string;
  payment_amount: number;
  #payment_token: string;
  #wallet: string;
  #responses: {
    [key: number]: number;
  };
  #node_replied: {
    [key: number]: boolean;
  };

  constructor(
    id: number,
    container_lookup: ContainerLookup,
    owner: string,
    active_at: number,
    period: number,
    frequency: number,
    redundancy: number,
    containers_hash: Buffer,
    lazy: boolean,
    verifier: string,
    payment_amount: number,
    payment_token: string,
    wallet: string
  ) {
    this.id = id;
    this.#container_lookup = container_lookup;
    this.#owner = owner;
    this.#active_at = active_at;
    this.#period = period;
    this.#frequency = frequency;
    this.#redundancy = redundancy;
    this.#containers_hash = containers_hash;
    this.#lazy = lazy;
    this.#verifier = verifier;
    this.payment_amount = payment_amount;
    this.#payment_token = payment_token;
    this.#wallet = wallet;
    this.#responses = {};
    this.#node_replied = {};
  }

  /**
   * Returns whether a subscription is active.
   */
  active(): boolean {
    return getUnixTimestamp() > this.#active_at;
  }

  /**
   * Returns whether a subscription is cancelled.
   */
  cancelled(): boolean {
    return this.#active_at === UINT32_MAX;
  }

  /**
   * Returns subscription owner.
   */
  owner(): Address {
    // Convert owner into a checksum encoded address before returning.
    return getAddress(this.#owner);
  }

  /**
   * Returns whether a subscription is past its last interval.
   */
  past_last_interval(): boolean {
    if (!this.active()) return false;

    return this.interval() > this.#frequency;
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

    return (
      Math.floor((getUnixTimestamp() - this.#active_at) / this.#period) + 1
    );
  }

  /**
   * Returns subscription container IDs.
   */
  containers(): string[] {
    return this.#container_lookup.get_containers(this.containers_hash());
  }

  /**
   * Returns subscription container IDs hash.
   */
  containers_hash(): `0x${string}` {
    return add0x(this.#containers_hash.toString('hex'));
  }

  /**
   * Returns subscription payment token.
   */
  payment_token(): Address {
    return getAddress(this.#payment_token);
  }

  /**
   * Returns subscription verifier address.
   */
  verifier(): Address {
    return getAddress(this.#verifier);
  }

  /**
   * Returns whether a subscription requires proof.
   */
  requires_proof(): boolean {
    return this.#verifier !== ADDRESS_ZERO;
  }

  /**
   * Returns whether a subscription requires payment.
   */
  provides_payment(): boolean {
    return this.payment_amount > 0;
  }

  /**
   * Returns subscription wallet address.
   */
  wallet(): Address {
    return getAddress(this.#wallet);
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
    const response = this.#responses[this.interval()];

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
  ): SignableMessage {
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
          owner: this.owner(),
          activeAt: this.#active_at,
          period: this.#period,
          frequency: this.#frequency,
          redundancy: this.#redundancy,
          containerId: this.containers_hash(),
          lazy: this.#lazy,
          verifier: this.verifier(),
          paymentAmount: BigInt(this.payment_amount),
          paymentToken: this.payment_token(),
          wallet: this.wallet(),
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
    Buffer,
    boolean,
    string,
    number,
    string,
    string
  ] {
    return [
      this.owner(),
      this.#active_at,
      this.#period,
      this.#frequency,
      this.#redundancy,
      this.#containers_hash,
      this.#lazy,
      this.#verifier,
      this.payment_amount,
      this.#payment_token,
      this.#wallet,
    ];
  }
}

export class SerializedSubscription {
  constructor(
    public owner: string,
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
      Buffer.from(this.containers, 'hex'),
      this.lazy,
      this.verifier,
      this.payment_amount,
      this.payment_token,
      this.wallet
    );
  }
}
