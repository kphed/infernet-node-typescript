// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/coordinator.py.
import {
  Hex,
  Address,
  BlockNumber,
  encodeAbiParameters,
  GetContractReturnType,
  Abi,
  Client,
  serializeSignature,
  recoverAddress,
  WriteContractReturnType,
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
  r: number | Hex;
  s: number | Hex;
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

  /**
   * Recovers delegatee signer from subscription + signature.
   */
  async recover_delegatee_signer(
    subscription: Subscription,
    signature: CoordinatorSignatureParams
  ): Promise<Address> {
    const chainId = await this.#rpc.get_chain_id();
    const typedDataHash = subscription.get_delegate_subscription_typed_data(
      signature.nonce,
      signature.expiry,
      chainId,
      this.#checksum_address
    );
    const serializedSignature = serializeSignature({
      r: signature.r as Hex,
      s: signature.s as Hex,
      yParity: signature.v,
    });

    return recoverAddress({
      signature: serializedSignature,
      hash: typedDataHash,
    });
  }

  /**
   * Generates a contract function to call Coordinator.deliverCompute().
   */
  get_deliver_compute_tx_contract_function(
    data: CoordinatorDeliveryParams
  ): Promise<WriteContractReturnType> {
    return this.#contract.write.deliverCompute([
      data.subscription.id,
      data.interval,
      data.input,
      data.output,
      data.proof,
      data.node_wallet,
    ]);
  }

  /**
   * Generates tx to call Coordinator.deliverComputeDelegatee().
   */
  get_deliver_compute_delegatee_tx(
    data: CoordinatorDeliveryParams,
    tx_params: CoordinatorTxParams,
    signature: CoordinatorSignatureParams
  ) {
    return this.#contract.write.deliverComputeDelegatee(
      [
        signature.nonce,
        signature.expiry,
        data.subscription.get_tx_inputs(),
        signature.v,
        signature.r,
        signature.s,
        data.interval,
        data.input,
        data.output,
        data.proof,
        data.node_wallet,
      ],
      {
        nonce: tx_params.nonce,
        from: tx_params.sender,
        gas: tx_params.gas_limit,
      }
    );
  }

  /**
   * Collects highest subscription ID at block number.
   */
  async get_head_subscription_id(block_number: BlockNumber): Promise<number> {
    const id = (await this.#contract.read.id({
      blockNumber: block_number,
    })) as number;

    return id - 1;
  }

  /**
   * Collects subscription by ID at block number.
   */
  async get_subscription_by_id(
    subscription_id: number,
    block_number: BlockNumber
  ): Promise<Subscription> {
    const [
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
      wallet,
    ] = (await this.#contract.read.getSubscription([subscription_id], {
      blockNumber: block_number,
    })) as [
      Address,
      number,
      number,
      number,
      number,
      Hex,
      boolean,
      Address,
      number,
      Address,
      Address
    ];

    return new Subscription(
      subscription_id,
      this.#lookup,
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
    );
  }

  /**
   * Returns local or remotely-available container inputs by subscription.
   *
   * 1. Attempts to collect and return on-chain inputs.
   * 2. Else, returns empty inputs.
   */
  async get_container_inputs(
    subscription: Subscription,
    interval: number,
    timestamp: number,
    caller: Address
  ): Promise<Hex> {
    const owner = RPC.get_checksum_address(subscription.owner);
    const consumer = this.#rpc.get_contract(owner, SUBSCRIPTION_CONSUMER_ABI);

    try {
      const containerInputs = (await consumer.read.getContainerInputs([
        subscription.id,
        interval,
        timestamp,
        caller,
      ])) as Hex;

      return containerInputs;
    } catch (err) {
      return '0x';
    }
  }

  /**
   * Checks whether a node has delivered a response for a subscription ID at current interval.
   */
  async get_node_has_delivered_response(
    subscription_id: number,
    interval: number,
    node_address: Address,
    block_number: BlockNumber
  ): Promise<boolean> {
    const key = encodeAbiParameters(
      [
        {
          type: 'uint32',
        },
        {
          type: 'uint32',
        },
        {
          type: 'address',
        },
      ],
      [subscription_id, interval, node_address]
    );
    const hash = RPC.get_keccak(['bytes'], [key]);

    return this.#contract.read.nodeResponded([hash], {
      blockNumber: block_number,
    }) as Promise<boolean>;
  }

  /**
   * Collects count(subscription responses) by ID for interval at block number.
   */
  async get_subscription_response_count(
    subscription_id: number,
    interval: number,
    block_number?: BlockNumber
  ): Promise<number> {
    let blockNumber = block_number;

    if (!blockNumber) blockNumber = await this.#rpc.get_head_block_number();

    const key = encodeAbiParameters(
      [{ type: 'uint32' }, { type: 'uint32' }],
      [subscription_id, interval]
    );
    const hash = RPC.get_keccak(['bytes'], [key]);

    return this.#contract.read.redundancyCount([hash], {
      blockNumber: block_number,
    }) as Promise<number>;
  }
}
