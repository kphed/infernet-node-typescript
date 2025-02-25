// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/coordinator.py.
import { z } from 'zod';
import {
  Hex,
  Address,
  encodeAbiParameters,
  GetContractReturnType,
  Abi,
  Client,
  serializeSignature,
  recoverAddress,
  SimulateContractReturnType,
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
import {
  HexSchema,
  AddressSchema,
  ChecksumAddressSchema,
  BlockNumberSchema,
} from '../shared/schemas';

enum CoordinatorEvent {
  SubscriptionCreated = 'SubscriptionCreated(uint32)',
  SubscriptionCancelled = 'SubscriptionCancelled(uint32)',
  SubscriptionFulfilled = 'SubscriptionFulfilled(uint32,address)',
}

export const CoordinatorEventSchema = z.nativeEnum(CoordinatorEvent);

export const CoordinatorSignatureParamsSchema = z.object({
  nonce: z.number(),
  expiry: z.number(),
  v: z.number(),
  r: z.union([z.number(), HexSchema]),
  s: z.union([z.number(), HexSchema]),
});

export const CoordinatorDeliveryParamsSchema = z
  .object({
    subscription: z.instanceof(Subscription),
    interval: z.number(),
    input: HexSchema,
    output: HexSchema,
    proof: HexSchema,
    node_wallet: AddressSchema,
  })
  .strict();

export const CoordinatorTxParamsSchema = z
  .object({
    nonce: z.number(),
    sender: AddressSchema,
    gas_limit: z.number(),
  })
  .strict();

export type CoordinatorDeliveryParams = z.infer<
  typeof CoordinatorDeliveryParamsSchema
>;

export type CoordinatorSignatureParams = z.infer<
  typeof CoordinatorSignatureParamsSchema
>;

export type CoordinatorTxParams = z.infer<typeof CoordinatorTxParamsSchema>;

const coordinatorEventHashes = Object.keys(CoordinatorEvent).reduce(
  (acc, event) => ({
    ...acc,
    // `get_event_hash` is a static field, and can be called without instantiating the class.
    [event]: RPC.get_event_hash(CoordinatorEvent[event]),
  }),
  {}
);

export class Coordinator {
  static fieldSchemas = {
    _rpc: z.instanceof(RPC),
    _lookup: z.instanceof(ContainerLookup),
    _checksum_address: ChecksumAddressSchema,
    _contract: z.custom<GetContractReturnType<Abi, Client, Address>>(),
  };

  static methodSchemas = {
    get_event_hashes: {
      returns: z.record(HexSchema),
    },
    get_delegated_signer: {
      args: {
        subscription: z.instanceof(Subscription),
        block_number: BlockNumberSchema,
      },
      returns: AddressSchema,
    },
    get_existing_delegate_subscription: {
      args: {
        subscription: z.instanceof(Subscription),
        signature: CoordinatorSignatureParamsSchema,
        block_number: BlockNumberSchema,
      },
      returns: z.tuple([z.boolean(), z.number()]),
    },
    recover_delegatee_signer: {
      args: {
        subscription: z.instanceof(Subscription),
        signature: CoordinatorSignatureParamsSchema,
      },
      returns: AddressSchema,
    },
    get_deliver_compute_tx_contract_function: {
      args: {
        data: CoordinatorDeliveryParamsSchema,
      },
      returns: z
        .function()
        .args(z.any())
        .returns(z.promise(z.custom<SimulateContractReturnType>())),
    },
    get_deliver_compute_delegatee_tx_contract_function: {
      args: {
        data: CoordinatorDeliveryParamsSchema,
        signature: CoordinatorSignatureParamsSchema,
      },
      returns: z
        .function()
        .args(z.any())
        .returns(z.promise(z.custom<SimulateContractReturnType>())),
    },
    get_deliver_compute_delegatee_tx: {
      args: {
        data: CoordinatorDeliveryParamsSchema,
        tx_params: CoordinatorTxParamsSchema,
        signature: CoordinatorSignatureParamsSchema,
      },
      returns: z.custom<WriteContractReturnType>(),
    },
    get_head_subscription_id: {
      args: {
        block_number: BlockNumberSchema,
      },
      returns: z.number(),
    },
    get_subscription_by_id: {
      args: {
        subscription_id: z.number(),
        block_number: BlockNumberSchema.optional(),
      },
      returns: z.instanceof(Subscription),
    },
    get_container_inputs: {
      args: {
        subscription: z.instanceof(Subscription),
        interval: z.number(),
        timestamp: z.number(),
        caller: AddressSchema,
      },
      returns: HexSchema,
    },
    get_node_has_delivered_response: {
      args: {
        subscription_id: z.number(),
        interval: z.number(),
        node_address: AddressSchema,
        block_number: BlockNumberSchema,
      },
      returns: z.boolean(),
    },
    get_subscription_response_count: {
      args: {
        subscription_id: z.number(),
        interval: z.number(),
        block_number: BlockNumberSchema.optional(),
      },
      returns: z.number(),
    },
  };

  #rpc: z.infer<typeof Coordinator.fieldSchemas._rpc>;
  #lookup: z.infer<typeof Coordinator.fieldSchemas._lookup>;
  #checksum_address: z.infer<typeof Coordinator.fieldSchemas._checksum_address>;
  #contract: z.infer<typeof Coordinator.fieldSchemas._contract>;

  constructor(rpc, coordinator_address, container_lookup) {
    if (!RPC.is_valid_address(coordinator_address))
      throw new Error('Coordinator address is incorrectly formatted');

    this.#rpc = Coordinator.fieldSchemas._rpc.parse(rpc);
    this.#lookup = Coordinator.fieldSchemas._lookup.parse(container_lookup);
    this.#checksum_address = Coordinator.fieldSchemas._checksum_address.parse(
      RPC.get_checksum_address(coordinator_address)
    );
    this.#contract = Coordinator.fieldSchemas._contract.parse(
      rpc.get_contract(this.#checksum_address, COORDINATOR_ABI)
    );

    console.debug('Initialized Coordinator', {
      address: this.#checksum_address,
    });
  }

  // Returns an object with "event name" keys with corresponding hash values.
  get_event_hashes(): z.infer<
    typeof Coordinator.methodSchemas.get_event_hashes.returns
  > {
    return Coordinator.methodSchemas.get_event_hashes.returns.parse(
      coordinatorEventHashes
    );
  }

  // Collects delegated signer from subscription consumer inheriting Delegator.sol.
  async get_delegated_signer(
    subscription: z.infer<
      typeof Coordinator.methodSchemas.get_delegated_signer.args.subscription
    >,
    block_number: z.infer<
      typeof Coordinator.methodSchemas.get_delegated_signer.args.block_number
    >
  ): Promise<
    z.infer<typeof Coordinator.methodSchemas.get_delegated_signer.returns>
  > {
    const delegator = this.#rpc.get_contract(
      subscription.owner,
      DELEGATED_SIGNER_ABI
    );
    let signer;

    try {
      signer = await delegator.read.getSigner(
        block_number
          ? {
              blockNumber: block_number,
            }
          : {}
      );
    } catch (err) {
      signer = await ZERO_ADDRESS;
    }

    return Coordinator.methodSchemas.get_delegated_signer.returns.parse(signer);
  }

  // Collects subscription ID created by DelegateSubscription, if exists.
  async get_existing_delegate_subscription(
    subscription: z.infer<
      typeof Coordinator.methodSchemas.get_existing_delegate_subscription.args.subscription
    >,
    signature: z.infer<
      typeof Coordinator.methodSchemas.get_existing_delegate_subscription.args.signature
    >,
    block_number: z.infer<
      typeof Coordinator.methodSchemas.get_existing_delegate_subscription.args.block_number
    >
  ): Promise<
    z.infer<
      typeof Coordinator.methodSchemas.get_existing_delegate_subscription.returns
    >
  > {
    const checksumAddress = RPC.get_checksum_address(subscription.owner);
    const key = encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint32' }],
      [checksumAddress, signature.nonce]
    );
    const hash = RPC.get_keccak(['bytes'], [key]);
    const subscriptionId = await this.#contract.read.delegateCreatedIds(
      [hash],
      block_number
        ? {
            blockNumber: block_number,
          }
        : {}
    );

    return Coordinator.methodSchemas.get_existing_delegate_subscription.returns.parse(
      [subscriptionId !== 0, Number(subscriptionId)]
    );
  }

  // Recovers delegatee signer from `subscription` and `signature`.
  async recover_delegatee_signer(
    subscription: z.infer<
      typeof Coordinator.methodSchemas.recover_delegatee_signer.args.subscription
    >,
    signature: z.infer<
      typeof Coordinator.methodSchemas.recover_delegatee_signer.args.signature
    >
  ): Promise<
    z.infer<typeof Coordinator.methodSchemas.recover_delegatee_signer.returns>
  > {
    return Coordinator.methodSchemas.recover_delegatee_signer.returns.parse(
      await recoverAddress({
        // Consider using `yParity` in the future since `v` is deprecated: https://github.com/wevm/viem/blob/main/src/types/misc.ts#L23.
        signature: serializeSignature({
          r: signature.r as Hex,
          s: signature.s as Hex,
          v: BigInt(signature.v),
        }),
        hash: subscription.get_delegate_subscription_typed_data(
          signature.nonce,
          signature.expiry,
          await this.#rpc.get_chain_id(),
          this.#checksum_address
        ),
      })
    );
  }

  // Returns a function with method args encapsulated for simulating and calling `Coordinator.deliverCompute`.
  get_deliver_compute_tx_contract_function(
    data: z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_tx_contract_function.args.data
    >
  ): z.infer<
    typeof Coordinator.methodSchemas.get_deliver_compute_tx_contract_function.returns
  > {
    return Coordinator.methodSchemas.get_deliver_compute_tx_contract_function.returns.parse(
      (options: any) =>
        this.#contract.simulate.deliverCompute(
          [
            data.subscription.id,
            data.interval,
            data.input,
            data.output,
            data.proof,
            data.node_wallet,
          ],
          options
        )
    );
  }

  // Returns a function with method args encapsulated for simulating and calling `Coordinator.deliverComputeDelegatee`.
  get_deliver_compute_delegatee_tx_contract_function(
    data: z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx_contract_function.args.data
    >,
    signature: z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx_contract_function.args.signature
    >
  ): z.infer<
    typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx_contract_function.returns
  > {
    return Coordinator.methodSchemas.get_deliver_compute_delegatee_tx_contract_function.returns.parse(
      (options: any) =>
        this.#contract.simulate.deliverComputeDelegatee(
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
          options
        )
    );
  }

  // Generates tx to call `Coordinator.deliverComputeDelegatee`.
  async get_deliver_compute_delegatee_tx(
    data: z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx.args.data
    >,
    tx_params: z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx.args.tx_params
    >,
    signature: z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx.args.signature
    >
  ): Promise<
    z.infer<
      typeof Coordinator.methodSchemas.get_deliver_compute_delegatee_tx.returns
    >
  > {
    const { request }: any =
      await this.get_deliver_compute_delegatee_tx_contract_function(
        data,
        signature
      );

    return Coordinator.methodSchemas.get_deliver_compute_delegatee_tx.returns.parse(
      this.#rpc.web3.writeContract({
        ...request,
        nonce: tx_params.nonce,
        from: tx_params.sender,
        gas: tx_params.gas_limit,
      })
    );
  }

  // Collects the highest subscription ID at block number.
  async get_head_subscription_id(
    block_number: z.infer<
      typeof Coordinator.methodSchemas.get_head_subscription_id.args.block_number
    >
  ): Promise<
    z.infer<typeof Coordinator.methodSchemas.get_head_subscription_id.returns>
  > {
    const id = await this.#contract.read.id({
      blockNumber: block_number,
    });

    return Coordinator.methodSchemas.get_head_subscription_id.returns.parse(
      Number(id) - 1
    );
  }

  // Collects subscription by ID at block number.
  async get_subscription_by_id(
    subscription_id: z.infer<
      typeof Coordinator.methodSchemas.get_subscription_by_id.args.subscription_id
    >,
    block_number?: z.infer<
      typeof Coordinator.methodSchemas.get_subscription_by_id.args.block_number
    >
  ): Promise<
    z.infer<typeof Coordinator.methodSchemas.get_subscription_by_id.returns>
  > {
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
    ] = (await this.#contract.read.getSubscription(
      [subscription_id],
      // If `block_number === undefined` will use the latest block number by default.
      block_number
        ? {
            blockNumber: block_number,
          }
        : {}
    )) as [
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

    return Coordinator.methodSchemas.get_subscription_by_id.returns.parse(
      new Subscription(
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
      )
    );
  }

  // Returns local or remotely-available container inputs by subscription.
  async get_container_inputs(
    subscription: z.infer<
      typeof Coordinator.methodSchemas.get_container_inputs.args.subscription
    >,
    interval: z.infer<
      typeof Coordinator.methodSchemas.get_container_inputs.args.interval
    >,
    timestamp: z.infer<
      typeof Coordinator.methodSchemas.get_container_inputs.args.timestamp
    >,
    caller: z.infer<
      typeof Coordinator.methodSchemas.get_container_inputs.args.caller
    >
  ): Promise<
    z.infer<typeof Coordinator.methodSchemas.get_container_inputs.returns>
  > {
    const owner = RPC.get_checksum_address(subscription.owner);
    const consumer = this.#rpc.get_contract(owner, SUBSCRIPTION_CONSUMER_ABI);
    let containerInputs;

    try {
      containerInputs = await consumer.read.getContainerInputs([
        subscription.id,
        interval,
        timestamp,
        caller,
      ]);
    } catch (err) {
      containerInputs = '0x';
    }

    return Coordinator.methodSchemas.get_container_inputs.returns.parse(
      containerInputs
    );
  }

  // Checks whether a node has delivered a response for a subscription ID at current interval.
  async get_node_has_delivered_response(
    subscription_id: z.infer<
      typeof Coordinator.methodSchemas.get_node_has_delivered_response.args.subscription_id
    >,
    interval: z.infer<
      typeof Coordinator.methodSchemas.get_node_has_delivered_response.args.interval
    >,
    node_address: z.infer<
      typeof Coordinator.methodSchemas.get_node_has_delivered_response.args.node_address
    >,
    block_number: z.infer<
      typeof Coordinator.methodSchemas.get_node_has_delivered_response.args.block_number
    >
  ): Promise<
    z.infer<
      typeof Coordinator.methodSchemas.get_node_has_delivered_response.returns
    >
  > {
    const nodeRespondedKey = encodeAbiParameters(
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
    const hash = RPC.get_keccak(['bytes'], [nodeRespondedKey]);

    return Coordinator.methodSchemas.get_node_has_delivered_response.returns.parse(
      await this.#contract.read.nodeResponded([hash], {
        blockNumber: block_number,
      })
    );
  }

  // Collects count(subscription responses) by ID for interval at block number.
  async get_subscription_response_count(
    subscription_id: z.infer<
      typeof Coordinator.methodSchemas.get_subscription_response_count.args.subscription_id
    >,
    interval: z.infer<
      typeof Coordinator.methodSchemas.get_subscription_response_count.args.interval
    >,
    block_number?: z.infer<
      typeof Coordinator.methodSchemas.get_subscription_response_count.args.block_number
    >
  ): Promise<
    z.infer<
      typeof Coordinator.methodSchemas.get_subscription_response_count.returns
    >
  > {
    const redundancyCountKey = encodeAbiParameters(
      [{ type: 'uint32' }, { type: 'uint32' }],
      [subscription_id, interval]
    );
    const hash = RPC.get_keccak(['bytes'], [redundancyCountKey]);

    return Coordinator.methodSchemas.get_subscription_response_count.returns.parse(
      await this.#contract.read.redundancyCount([hash], {
        ...(block_number ? { blockNumber: block_number } : {}),
      })
    );
  }
}
