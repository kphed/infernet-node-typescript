// Reference: https://github.com/ritual-net/infernet-node/blob/7418dff0b55ba85c27b8764529f5e5f0aa9cbdb3/src/shared/subscription.py.
import { Address, SignableMessage, getAddress, hashTypedData } from 'viem';
import { ContainerLookup } from '../chain/containerLookup';

// 2 ** 32 - 1.
const UINT32_MAX = 4294967295;

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const add0x = (hash: string): `0x${string}` => {
  if (hash.substring(0, 2) === '0x') return hash as `0x${string}`;

  return `0x${hash}`;
};

const getUnixTimestamp = (): number => Math.floor(new Date().getTime() / 1_000);

export class Subscription {
  id: number;
  payment_amount: number;
  payment_token: Address;
  verifier: Address;
  owner: Address;
  containers_hash: `0x${string}`;
  wallet: Address;
  #container_lookup: ContainerLookup;
  #active_at: number;
  #period: number;
  #frequency: number;
  #redundancy: number;
  #lazy: boolean;
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
    containers_hash: string,
    lazy: boolean,
    verifier: string,
    payment_amount: number,
    payment_token: string,
    wallet: string
  ) {
    this.id = id;
    this.payment_amount = payment_amount;
    this.payment_token = getAddress(payment_token);
    this.verifier = getAddress(verifier);
    this.owner = getAddress(owner);
    this.containers_hash = add0x(containers_hash);
    this.wallet = getAddress(wallet);
    this.#container_lookup = container_lookup;
    this.#active_at = active_at;
    this.#period = period;
    this.#frequency = frequency;
    this.#redundancy = redundancy;
    this.#lazy = lazy;
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

    return (
      Math.floor((getUnixTimestamp() - this.#active_at) / this.#period) + 1
    );
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
    return this.verifier !== ADDRESS_ZERO;
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
      this.containers,
      this.lazy,
      this.verifier,
      this.payment_amount,
      this.payment_token,
      this.wallet
    );
  }
}
