// Reference: https://github.com/ritual-net/infernet-node/blob/7753fef9ca3e1383843919bfbb2cc175f8dcd3b7/src/chain/listener.py.
import { BlockNumber } from 'viem';
import { Coordinator, ChainProcessor, Reader, Registry, RPC } from './index';
import { Guardian } from '../orchestration';
import { ConfigSnapshotSync } from '../shared/config';
import {
  GuardianError,
  SubscriptionCreatedMessageSchema,
} from '../shared/message';
import { AsyncTask } from '../shared/service';
import { Subscription } from '../shared/subscription';
import { delay } from '../utils/helpers';

/**
 * Get batches of size batch_size from start to end (inclusive), used for snapshot sync.
 */
const getBatches = (
  start: number,
  end: number,
  batchSize: number
): [number, number][] => {
  if (start === end) {
    return [[start, start + 1]];
  } else if (end - start + 1 <= batchSize) {
    return [[start, end + 1]];
  }

  const batches: [number, number][] = [];

  for (let i = start; i < end + 1; i += batchSize) {
    batches.push([i, Math.min(i + batchSize - 1, end) + 1]);
  }

  return batches;
};

export class ChainListener extends AsyncTask {
  #rpc: RPC;
  #coordinator: Coordinator;
  #registry: Registry;
  #reader: Reader;
  #guardian: Guardian;
  #processor: ChainProcessor;
  #trail_head_blocks: bigint;
  #snapshot_sync_sleep: number;
  #snapshot_sync_batch_size: number;
  #snapshot_sync_starting_sub_id: number;
  #syncing_period: number;
  #last_block: bigint = 0n;
  #last_subscription_id: number = 0;

  constructor(
    rpc: RPC,
    coordinator: Coordinator,
    registry: Registry,
    reader: Reader,
    guardian: Guardian,
    processor: ChainProcessor,
    trail_head_blocks: number,
    snapshot_sync: ConfigSnapshotSync
  ) {
    super();

    this.#rpc = rpc;
    this.#coordinator = coordinator;
    this.#registry = registry;
    this.#reader = reader;
    this.#guardian = guardian;
    this.#processor = processor;
    this.#trail_head_blocks = BigInt(trail_head_blocks);
    this.#snapshot_sync_sleep = snapshot_sync.sleep;
    this.#snapshot_sync_batch_size = snapshot_sync.batch_size;
    this.#snapshot_sync_starting_sub_id = snapshot_sync.starting_sub_id;
    this.#syncing_period = snapshot_sync.sync_period;

    console.info('Initialized ChainListener');
  }

  /**
   * Syncs a batch of subscriptions from start_id to end_id (inclusive).
   *
   * Consumed by:
   * 1. Snapshot sync when initially syncing subscriptions.
   * 2. Parsing subscription creation logs when event replaying creation.
   *
   * Process:
   * 1. Collect subscriptions at specified block number through Reader SC.
   * 2. Collect batch response count at specified block number through Reader SC.
   * 3. For subscriptions that are on last interval, collect and set response count
   * (useful to filter out completed subscriptions).
   * 4. Validate subscriptions against guardian rules.
   * 5. If validated, forward subscriptions to ChainProcessor.
   */
  async #sync_batch_subscriptions_creation(
    start_id: number,
    end_id: number,
    block_number: BlockNumber
  ): Promise<void> {
    if (this.shutdown) return;

    const subscriptions = await this.#reader.read_subscription_batch(
      start_id,
      end_id,
      block_number
    );

    // Get IDs, intervals and response count data for subscriptions that are on last interval.
    const { filteredIds, filteredIntervals } = subscriptions.reduce(
      (
        acc: { filteredIds: number[]; filteredIntervals: number[] },
        subscription: Subscription
      ) => {
        if (subscription.last_interval()) {
          return {
            filteredIds: [...acc.filteredIds, subscription.id],
            filteredIntervals: [
              ...acc.filteredIntervals,
              subscription.interval(),
            ],
          };
        }

        return acc;
      },
      { filteredIds: [], filteredIntervals: [] }
    );
    const filteredResponseCount =
      await this.#reader.read_redundancy_count_batch(
        filteredIds,
        filteredIntervals,
        block_number
      );

    if (
      filteredIds.length !== filteredIntervals.length ||
      filteredIds.length !== filteredResponseCount.length
    )
      throw new Error('Arrays must have the same length');

    // For faster subscription ID lookups.
    const subscriptionsById = subscriptions.reduce(
      (acc, subscription: Subscription) => ({
        ...acc,
        [subscription.id]: subscription,
      }),
      {}
    );

    for (let i = 0; i < filteredIds.length; i++) {
      const subscription: Subscription = subscriptionsById[filteredIds[i]];

      if (subscription)
        subscription.set_response_count(
          filteredIntervals[i],
          filteredResponseCount[i]
        );
    }

    for (let i = 0; i < subscriptions.length; i++) {
      const subscription = subscriptions[i];
      const msg = SubscriptionCreatedMessageSchema.parse(subscription);
      const filtered = this.#guardian.process_message(msg);

      if (filtered instanceof GuardianError) {
        // If filtered out by guardian, message is irrelevant.
        console.info('Ignored subscription creation', {
          id: subscription.id,
          err: filtered.error,
        });
      } else {
        this.#processor.track(msg);

        console.info('Relayed subscription creation', {
          id: subscription.id,
        });
      }
    }
  }

  /**
   * Snapshot syncs subscriptions from Coordinator up to the latest subscription
   * read at the head block. Retries on failure, with exponential backoff. Since
   * `ChainProcessor` keeps track of subscriptions indexed by their ID, this method
   * is idempotent.
   *
   * Process:
   * 1. Collect highest subscription ID from Coordinator at head block.
   * 2. From _last_subscription_id + 1 -> head_sub_id, _sync_subscription_creation.
   */
  async #snapshot_sync(head_block: BlockNumber): Promise<void> {
    const headSubId = await this.#coordinator.get_head_subscription_id(
      head_block
    );

    console.info('Collected highest subscription id', {
      id: headSubId,
      head_block,
    });

    // Subscription indexes are 1-indexed at contract level. For
    // subscriptions 1 -> head, sync subscription creation sync is happening
    // in parallel in batches of size this.#snapshot_sync_batch_size. To throttle,
    // sleeps this.#snapshot_sync_sleep seconds between each batch.
    const start = this.#last_subscription_id + 1;

    const batches = getBatches(
      start,
      headSubId,
      this.#snapshot_sync_batch_size
    );

    // No new subscriptions to sync.
    if (batches.length === 1 && batches[0][0] === batches[0][1]) return;

    console.info('Syncing new subscriptions', { batches });

    // Sync subscriptions in batch with retry and exponential backoff.
    const sync_subscription_batch_with_retry = async (
      batch: [number, number],
      sleep: number,
      backoff: number
    ) => {
      try {
        await this.#sync_batch_subscriptions_creation(
          batch[0],
          batch[1],
          head_block
        );
      } catch (err) {
        console.error(
          `Error syncing subscription batch ${batch}. Retrying...`,
          { batch, err }
        );

        await delay(sleep);

        return sync_subscription_batch_with_retry(
          batch,
          sleep * backoff,
          backoff
        );
      }
    };

    for (let i = 0; i < batches.length; i++) {
      // Sync for this batch.
      await sync_subscription_batch_with_retry(
        batches[i],
        this.#snapshot_sync_sleep,
        2
      );

      // Sleep between batches to avoid getting rate-limited by the RPC.
      await delay(this.#snapshot_sync_sleep);
    }
  }

  /**
   * ChainListener startup.
   *
   * Process:
   * 1. Collect head block number from RPC.
   * 2. Snapshot sync subscriptions from Coordinator up to head block.
   * 3. Update locally-aware latest block in memory.
   */
  async setup(): Promise<void> {
    const headBlock: bigint =
      (await this.#rpc.get_head_block_number()) - this.#trail_head_blocks;

    this.#last_block = headBlock;
    this.#last_subscription_id = this.#snapshot_sync_starting_sub_id;

    console.info('Started snapshot sync', {
      head: headBlock,
      behind: this.#trail_head_blocks,
    });

    // Snapshot sync subscriptions.
    await this.#snapshot_sync(headBlock);

    const headSubId = await this.#coordinator.get_head_subscription_id(
      headBlock
    );

    // Setting this after snapshot, to avoid a 2nd full run of "run_forever" method.
    this.#last_subscription_id = headSubId;

    console.info('Finished snapshot sync', { new_head: headBlock });
  }

  /**
   * Core ChainListener event loop.
   *
   * Process:
   * 1. Collects chain head block and latest locally synced block.
   * 2. If head > locally_synced:
   *    2.1. Collects coordinator subscription creations (locally_synced, head).
   *        2.1.1. Up to a maximum of 100 blocks to not overload RPC.
   *    2.2. Syncs new subscriptions and updates last synced block.
   * 3. Else, if chain head block <= latest locally synced block, sleeps for 500ms.
   */
  async run_forever(): Promise<void> {
    console.info('Started ChainListener lifecycle', {
      last_synced: this.#last_block,
    });

    while (!this.shutdown) {
      const headBlock =
        (await this.#rpc.get_head_block_number()) - this.#trail_head_blocks;

      // Check if latest locally synced block < chain head block.
      if (this.#last_block < headBlock) {
        const numBlocksToSync = Math.min(
          Number(headBlock - this.#last_block),
          100
        );
        const targetBlock = this.#last_block + BigInt(numBlocksToSync);
        const headSubId = await this.#coordinator.get_head_subscription_id(
          targetBlock
        );

        console.info(`Head sub id is: ${headSubId}`);

        const numSubsToSync = Math.min(
          headSubId - this.#last_subscription_id,
          this.#snapshot_sync_batch_size
        );

        // Collect all Coordinator emitted event logs in range.
        console.info('Checking subscriptions', {
          last_sub_id: this.#last_subscription_id,
          head_sub_id: headSubId,
          num_subs_to_sync: numSubsToSync,
          head_block: headBlock,
        });

        await this.#snapshot_sync(headBlock);

        this.#last_block = targetBlock;
        this.#last_subscription_id = headSubId;

        console.info('Checked for new subscriptions', {
          last_synced: this.#last_block,
          last_sub_id: this.#last_subscription_id,
          head_sub_id: headSubId,
        });
      } else {
        // Else, if already synced to head, sleep.
        console.debug(
          `No new blocks, sleeping for: ${this.#syncing_period} seconds`,
          {
            head: headBlock,
            synced: this.#last_block,
            behind: this.#trail_head_blocks,
          }
        );

        await delay(this.#syncing_period);
      }
    }
  }

  cleanup(): void {}
}
