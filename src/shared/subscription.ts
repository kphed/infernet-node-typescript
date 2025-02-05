// Reference: https://github.com/ritual-net/infernet-node/blob/7418dff0b55ba85c27b8764529f5e5f0aa9cbdb3/src/shared/subscription.py.

// 2 ** 32 - 1;
const UINT32_MAX = 4294967295;

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const add0x = (hash: string): string => {
  if (hash.substring(0, 2) === '0x') return hash;

  return `0x${hash}`;
};

class Subscription {
  id: number;
  owner: string;
  #container_lookup: any;
  #active_at: number;
  #period: number;
  #frequency: number;
  #redundancy: number;
  #containers_hash: Buffer;
  #lazy: boolean;
  #verifier: string;
  #payment_amount: number;
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
    container_lookup: any,
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
    this.owner = owner;
    this.#active_at = active_at;
    this.#period = period;
    this.#frequency = frequency;
    this.#redundancy = redundancy;
    this.#containers_hash = containers_hash;
    this.#lazy = lazy;
    this.#verifier = verifier;
    this.#payment_amount = payment_amount;
    this.#payment_token = payment_token;
    this.#wallet = wallet;
    this.#responses = {};
    this.#node_replied = {};
  }

  /**
   * Returns whether a subscription requires proof.
   */
  requires_proof(): boolean {
    return this.#verifier != ADDRESS_ZERO;
  }

  /**
   * Returns subscription container IDs.
   */
  containers(): string[] {
    return this.#container_lookup.get_containers(this.#containers_hash);
  }

  /**
   * Returns whether a subscription is active.
   */
  active() {}

  /**
   * Returns current subscription interval.
   */
  interval() {}

  /**
   * Returns whether subscription is on last interval.
   */
  last_interval() {}

  /**
   * Returns whether subscription is completed.
   */
  completed() {}

  /**
   * Returns expected interval for a response timestamp.
   */
  get_interval_by_timestamp() {}

  /**
   * Returns number of responses tracked in interval.
   */
  get_response_count() {}

  /**
   * Sets number of responses for an interval.
   */
  set_response_count() {}

  /**
   * Returns whether local node has responded in interval.
   */
  get_node_replied() {}

  /**
   * Sets local node as responded in interval.
   */
  set_node_replied() {}

  /**
   * Generates EIP-712 DelegateeSubscription data.
   */
  get_delegate_subscription_typed_data() {}

  /**
   * Returns subscription parameters in tx array format.
   */
  get_tx_inputs() {}
}
