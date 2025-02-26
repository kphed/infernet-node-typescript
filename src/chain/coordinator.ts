// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/coordinator.py.
import { z } from 'zod';
import {
  Hex,
  Address,
  encodeAbiParameters,
  serializeSignature,
  recoverAddress,
  SimulateContractReturnType,
  WriteContractReturnType,
  toHex,
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
  ContractInstanceSchema,
} from '../shared/schemas';

export enum CoordinatorEvent {
  SubscriptionCreated = 'SubscriptionCreated(uint32)',
  SubscriptionCancelled = 'SubscriptionCancelled(uint32)',
  SubscriptionFulfilled = 'SubscriptionFulfilled(uint32,address)',
}

export const CoordinatorEventSchema = z.nativeEnum(CoordinatorEvent);

export const CoordinatorSignatureParamsSchema = z.object({
  nonce: z.number(),
  expiry: z.number(),
  v: z.bigint(),
  r: z.bigint(),
  s: z.bigint(),
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

export const BigIntToBytes32Schema = z
  .function()
  .args(z.bigint())
  .returns(HexSchema);

export type CoordinatorDeliveryParams = z.infer<
  typeof CoordinatorDeliveryParamsSchema
>;

export type CoordinatorSignatureParams = z.infer<
  typeof CoordinatorSignatureParamsSchema
>;

export type CoordinatorTxParams = z.infer<typeof CoordinatorTxParamsSchema>;

export type BigIntToBytes32 = z.infer<typeof BigIntToBytes32Schema>;

const coordinatorEventHashes = Object.keys(CoordinatorEvent).reduce(
  (acc, event) => ({
    ...acc,
    // `get_event_hash` is a static field, and can be called without instantiating the class.
    [event]: RPC.get_event_hash(CoordinatorEvent[event]),
  }),
  {}
);

const bigIntToBytes32: BigIntToBytes32 = (val) => toHex(val, { size: 32 });

export class Coordinator {
  static fieldSchemas = {
    _rpc: z.instanceof(RPC),
    _lookup: z.instanceof(ContainerLookup),
    _checksum_address: ChecksumAddressSchema,
    _contract: ContractInstanceSchema,
  };

  static methodSchemas = {
    get_event_hashes: z.function().returns(z.record(HexSchema)),
    get_delegated_signer: z
      .function()
      .args(z.instanceof(Subscription), BlockNumberSchema)
      .returns(z.promise(AddressSchema)),
    get_existing_delegate_subscription: z
      .function()
      .args(
        z.instanceof(Subscription),
        CoordinatorSignatureParamsSchema,
        BlockNumberSchema
      )
      .returns(z.promise(z.tuple([z.boolean(), z.number()]))),
    recover_delegatee_signer: z
      .function()
      .args(z.instanceof(Subscription), CoordinatorSignatureParamsSchema)
      .returns(z.promise(AddressSchema)),
    get_deliver_compute_tx_contract_function: z
      .function()
      .args(z.any())
      .returns(
        z
          .function()
          .args(z.any())
          .returns(z.promise(z.custom<SimulateContractReturnType>()))
      ),
    get_deliver_compute_delegatee_tx_contract_function: z
      .function()
      .args(CoordinatorDeliveryParamsSchema, CoordinatorSignatureParamsSchema)
      .returns(
        z
          .function()
          .args(z.any())
          .returns(z.promise(z.custom<SimulateContractReturnType>()))
      ),
    get_deliver_compute_delegatee_tx: z
      .function()
      .args(
        CoordinatorDeliveryParamsSchema,
        CoordinatorTxParamsSchema,
        CoordinatorSignatureParamsSchema
      )
      .returns(z.promise(z.custom<WriteContractReturnType>())),
    get_head_subscription_id: z
      .function()
      .args(BlockNumberSchema)
      .returns(z.promise(z.number())),
    get_subscription_by_id: z
      .function()
      .args(z.number(), BlockNumberSchema.optional())
      .returns(z.promise(z.instanceof(Subscription))),
    get_container_inputs: z
      .function()
      .args(z.instanceof(Subscription), z.number(), z.number(), AddressSchema)
      .returns(z.promise(HexSchema)),
    get_node_has_delivered_response: z
      .function()
      .args(z.number(), z.number(), AddressSchema, BlockNumberSchema)
      .returns(z.promise(z.boolean())),
    get_subscription_response_count: z
      .function()
      .args(z.number(), z.number(), BlockNumberSchema.optional())
      .returns(z.promise(z.number())),
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
  get_event_hashes = Coordinator.methodSchemas.get_event_hashes.implement(
    () => coordinatorEventHashes
  );

  // Collects delegated signer from subscription consumer inheriting Delegator.sol.
  get_delegated_signer =
    Coordinator.methodSchemas.get_delegated_signer.implement(
      async (subscription, block_number) => {
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

        return signer;
      }
    );

  // Collects subscription ID created by DelegateSubscription, if exists.
  get_existing_delegate_subscription =
    Coordinator.methodSchemas.get_existing_delegate_subscription.implement(
      async (subscription, signature, block_number) => {
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

        return [subscriptionId !== 0, Number(subscriptionId)];
      }
    );

  // Recovers delegatee signer from `subscription` and `signature`.
  recover_delegatee_signer =
    Coordinator.methodSchemas.recover_delegatee_signer.implement(
      async (subscription, signature) =>
        recoverAddress({
          // Consider using `yParity` in the future since `v` is deprecated: https://github.com/wevm/viem/blob/main/src/types/misc.ts#L23.
          signature: serializeSignature({
            r: bigIntToBytes32(signature.r),
            s: bigIntToBytes32(signature.s),
            v: signature.v,
          }),
          hash: subscription.get_delegate_subscription_typed_data(
            signature.nonce,
            signature.expiry,
            await this.#rpc.get_chain_id(),
            this.#checksum_address
          ),
        })
    );

  // Returns a function with method args encapsulated for simulating and calling `Coordinator.deliverCompute`.
  get_deliver_compute_tx_contract_function =
    Coordinator.methodSchemas.get_deliver_compute_tx_contract_function.implement(
      (data) => (options: any) =>
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

  // Returns a function with method args encapsulated for simulating and calling `Coordinator.deliverComputeDelegatee`.
  get_deliver_compute_delegatee_tx_contract_function =
    Coordinator.methodSchemas.get_deliver_compute_delegatee_tx_contract_function.implement(
      (data, signature) => (options: any) =>
        this.#contract.simulate.deliverComputeDelegatee(
          [
            signature.nonce,
            signature.expiry,
            data.subscription.get_tx_inputs(),
            signature.v,
            bigIntToBytes32(signature.r),
            bigIntToBytes32(signature.s),
            data.interval,
            data.input,
            data.output,
            data.proof,
            data.node_wallet,
          ],
          options
        )
    );

  // Generates tx to call `Coordinator.deliverComputeDelegatee`.
  get_deliver_compute_delegatee_tx =
    Coordinator.methodSchemas.get_deliver_compute_delegatee_tx.implement(
      async (data, tx_params, signature) => {
        const { request }: any =
          await this.get_deliver_compute_delegatee_tx_contract_function(
            data,
            signature
          );

        return this.#rpc.wallet.writeContract({
          ...request,
          nonce: tx_params.nonce,
          from: tx_params.sender,
          gas: tx_params.gas_limit,
        });
      }
    );

  // Collects the highest subscription ID at block number.
  get_head_subscription_id =
    Coordinator.methodSchemas.get_head_subscription_id.implement(
      async (block_number) => {
        const id = await this.#contract.read.id({
          blockNumber: block_number,
        });

        return Number(id) - 1;
      }
    );

  // Collects subscription by ID at block number.
  get_subscription_by_id =
    Coordinator.methodSchemas.get_subscription_by_id.implement(
      async (subscription_id, block_number) => {
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
          block_number !== 0n
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
    );

  // Returns local or remotely-available container inputs by subscription.
  get_container_inputs =
    Coordinator.methodSchemas.get_container_inputs.implement(
      async (subscription, interval, timestamp, caller) => {
        const owner = RPC.get_checksum_address(subscription.owner);
        const consumer = this.#rpc.get_contract(
          owner,
          SUBSCRIPTION_CONSUMER_ABI
        );
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

        return containerInputs;
      }
    );

  // Checks whether a node has delivered a response for a subscription ID at current interval.
  get_node_has_delivered_response =
    Coordinator.methodSchemas.get_node_has_delivered_response.implement(
      async (subscription_id, interval, node_address, block_number) => {
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

        return this.#contract.read.nodeResponded([hash], {
          blockNumber: block_number,
        }) as Promise<boolean>;
      }
    );

  // Collects count(subscription responses) by ID for interval at block number.
  get_subscription_response_count =
    Coordinator.methodSchemas.get_subscription_response_count.implement(
      async (subscription_id, interval, block_number) => {
        const redundancyCountKey = encodeAbiParameters(
          [{ type: 'uint32' }, { type: 'uint32' }],
          [subscription_id, interval]
        );
        const hash = RPC.get_keccak(['bytes'], [redundancyCountKey]);

        return this.#contract.read.redundancyCount([hash], {
          ...(block_number !== 0n ? { blockNumber: block_number } : {}),
        }) as Promise<number>;
      }
    );
}
