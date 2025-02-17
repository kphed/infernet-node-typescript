// Reference: https://github.com/ritual-net/infernet-node/blob/397d982d3bfa837ba3fc73d1641acfc62a01fd25/src/chain/reader.py.
import {
  Address,
  Hex,
  GetContractReturnType,
  Abi,
  Client,
  BlockNumber,
} from 'viem';
import { ContainerLookup } from './containerLookup';
import { RPC } from './rpc';
import { Subscription } from '../shared/subscription';
import { READER_ABI } from '../utils/constants';

export class Reader {
  #lookup: ContainerLookup;
  #checksum_address: Address;
  #contract: GetContractReturnType<Abi, Client, Address>;

  constructor(
    rpc: RPC,
    reader_address: string,
    container_lookup: ContainerLookup
  ) {
    if (!RPC.is_valid_address(reader_address))
      throw new Error('Reader address is incorrectly formatted');

    this.#lookup = container_lookup;
    this.#checksum_address = RPC.get_checksum_address(reader_address);
    this.#contract = rpc.get_contract(this.#checksum_address, READER_ABI);

    console.debug('Initialized Reader', { address: this.#checksum_address });
  }

  /**
   * Reads Subscriptions from Coordinator in batch.
   */
  async reader_subscription_batch(
    start_id: number,
    end_id: number,
    block_number: BlockNumber
  ): Promise<Subscription[]> {
    const subscriptionsData: any =
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

  /**
   * Given Subscription ids and intervals, collects redundancy count of (subscription, interval)-pair.
   */
  read_redundancy_count_batch(
    ids: number[],
    intervals: number[],
    block_number: BlockNumber
  ): Promise<number[]> {
    return this.#contract.read.readRedundancyCountBatch([ids, intervals], {
      blockNumber: block_number,
    }) as Promise<number[]>;
  }
}
