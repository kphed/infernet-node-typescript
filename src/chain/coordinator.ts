// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/coordinator.py.
import {
  Hex,
  Address,
  BlockNumber,
  encodeAbiParameters,
  GetContractReturnType,
  Abi,
  Client,
} from 'viem';
import { RPC } from './rpc';
import {
  COORDINATOR_ABI,
  DELEGATED_SIGNER_ABI,
  SUBSCRIPTION_CONSUMER_ABI,
  ZERO_ADDRESS,
} from '../utils/constants';
import { Subscription } from '../shared/subscription';
import { ContainerLookup } from './containerLookup';

enum CoordinatorEvent {
  SubscriptionCreated = 'SubscriptionCreated(uint32)',
  SubscriptionCancelled = 'SubscriptionCancelled(uint32)',
  SubscriptionFulfilled = 'SubscriptionFulfilled(uint32,address)',
}

interface CoordinatorDeliveryParams {
  subscription: Subscription;
  interval: number;
  input: Hex;
  output: Hex;
  proof: Hex;
  node_wallet: Address;
}

export interface CoordinatorSignatureParams {
  nonce: number;
  expiry: number;
  v: number;
  r: number;
  s: number;
}

interface CoordinatorTxParams {
  nonce: number;
  sender: Address;
  gas_limit: number;
}

type TopicType = Hex;

export class Coordinator {
  #rpc: RPC;
  #lookup: ContainerLookup;
  #checksum_address: Address;
  #contract: GetContractReturnType<Abi, Client, Address>;

  constructor(
    rpc: RPC,
    coordinator_address: Address,
    container_lookup: ContainerLookup
  ) {
    if (!RPC.is_valid_address(coordinator_address))
      throw new Error('Coordinator address is incorrectly formatted');

    this.#rpc = rpc;
    this.#lookup = container_lookup;
    this.#checksum_address = RPC.get_checksum_address(coordinator_address);
    this.#contract = rpc.get_contract(this.#checksum_address, COORDINATOR_ABI);

    console.log('Initialized Coordinator', { address: this.#checksum_address });
  }

  /**
   * Gets event => event hash dictionary.
   */
  get_event_hashes(): {
    [key: string]: Hex;
  } {
    return Object.keys(CoordinatorEvent).reduce((acc, event) => {
      return {
        ...acc,
        [event]: RPC.get_event_hash(CoordinatorEvent[event]),
      };
    }, {});
  }

  /**
   * Collects delegated signer from subscription consumer inheriting Delegator.sol.
   */
  async get_delegated_signer(
    subscription: Subscription,
    block_number: BlockNumber
  ): Promise<Address> {
    const delegator = this.#rpc.get_contract(
      subscription.owner,
      DELEGATED_SIGNER_ABI
    );

    try {
      return delegator.read.getSigner(
        block_number
          ? {
              blockNumber: block_number,
            }
          : {}
      ) as Promise<Address>;
    } catch (err) {
      return ZERO_ADDRESS;
    }
  }

  /**
   * Collects subscription ID created by DelegateSubscription, if exists.
   */
  async get_existing_delegate_subscription(
    subscription: Subscription,
    signature: CoordinatorSignatureParams,
    block_number: BlockNumber
  ): Promise<[boolean, number]> {
    const checksumAddress = RPC.get_checksum_address(subscription.owner);
    const key = encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint32' }],
      [checksumAddress, signature.nonce]
    );
    const hash = RPC.get_keccak(['bytes'], [key]);
    const subscriptionId = (await this.#contract.read.delegateCreatedIds(
      [hash],
      block_number
        ? {
            blockNumber: block_number,
          }
        : {}
    )) as number;

    return [subscriptionId !== 0, subscriptionId];
  }
}
