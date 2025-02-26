// Reference: https://github.com/ritual-net/infernet-node/blob/397d982d3bfa837ba3fc73d1641acfc62a01fd25/src/chain/reader.py.
import { z } from 'zod';
import { Address, Hex, BlockNumber } from 'viem';
import { ContainerLookup } from './containerLookup';
import { RPC } from './rpc';
import { Subscription } from '../shared/subscription';
import { READER_ABI } from '../utils/constants';
import {
  BlockNumberSchema,
  ChecksumAddressSchema,
  ContractInstanceSchema,
} from '../shared/schemas';

export class Reader {
  static fieldSchemas = {
    _lookup: z.instanceof(ContainerLookup),
    _checksum_address: ChecksumAddressSchema,
    _contract: ContractInstanceSchema,
  };

  static methodSchemas = {
    read_subscription_batch: z
      .function()
      .args(z.number(), z.number(), BlockNumberSchema)
      .returns(z.promise(z.instanceof(Subscription).array())),
    read_redundancy_count_batch: z
      .function()
      .args(z.number().array(), z.number().array(), BlockNumberSchema)
      .returns(z.promise(z.number().array())),
  };

  #lookup: z.infer<typeof Reader.fieldSchemas._lookup>;
  #checksum_address: z.infer<typeof Reader.fieldSchemas._checksum_address>;
  #contract: z.infer<typeof Reader.fieldSchemas._contract>;

  constructor(rpc, reader_address, container_lookup) {
    this.#lookup = Reader.fieldSchemas._lookup.parse(container_lookup);
    this.#checksum_address = Reader.fieldSchemas._checksum_address.parse(
      RPC.get_checksum_address(reader_address)
    );
    this.#contract = Reader.fieldSchemas._contract.parse(
      rpc.get_contract(this.#checksum_address, READER_ABI)
    );

    console.debug('Initialized Reader', { address: this.#checksum_address });
  }

  // Reads Subscriptions from Coordinator in batch.
  read_subscription_batch =
    Reader.methodSchemas.read_subscription_batch.implement(
      async (start_id: number, end_id: number, block_number: BlockNumber) => {
        const subscriptionsData =
          (await this.#contract.read.readSubscriptionBatch([start_id, end_id], {
            blockNumber: block_number,
          })) as {
            owner: Address;
            activeAt: number;
            period: number;
            frequency: number;
            redundancy: number;
            containerId: Hex;
            lazy: boolean;
            verifier: Address;
            paymentAmount: bigint;
            paymentToken: Address;
            wallet: Address;
          }[];
        const subscriptions: Subscription[] = [];

        for (let i = 0; i < subscriptionsData.length; i++) {
          const data = subscriptionsData[i];

          subscriptions.push(
            new Subscription(
              start_id + i,
              this.#lookup,
              data.owner,
              data.activeAt,
              data.period,
              data.frequency,
              data.redundancy,
              data.containerId,
              data.lazy,
              data.verifier,
              Number(data.paymentAmount),
              data.paymentToken,
              data.wallet
            )
          );
        }

        return subscriptions;
      }
    );

  // Given Subscription ids and intervals, collects redundancy count of (subscription, interval)-pair.
  read_redundancy_count_batch =
    Reader.methodSchemas.read_redundancy_count_batch.implement(
      (ids, intervals, block_number) =>
        this.#contract.read.readRedundancyCountBatch([ids, intervals], {
          blockNumber: block_number,
        }) as Promise<number[]>
    );
}
