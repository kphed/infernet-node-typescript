// Reference: https://github.com/ritual-net/infernet-node/blob/7753fef9ca3e1383843919bfbb2cc175f8dcd3b7/src/chain/listener.py.
import { z } from 'zod';
import { Coordinator } from './coordinator';
import { ChainProcessor } from './processor';
import { Reader } from './reader';
import { Registry } from './registry';
import { RPC } from './rpc';
import { Guardian } from '../orchestration/guardian';
import {
  GuardianError,
  SubscriptionCreatedMessageSchema,
  MessageType,
} from '../shared/message';
import { AsyncTask } from '../shared/service';
import { Subscription } from '../shared/subscription';
import { delay } from '../utils/helpers';
import { BlockNumberSchema } from '../shared/schemas';

const GetBatchesSchema = z
  .function()
  .args(z.number(), z.number(), z.number())
  .returns(z.tuple([z.number(), z.number()]).array());

// Get batches of size `batchSize` from start to end (inclusive), used for snapshot sync.
const getBatches = GetBatchesSchema.implement((start, end, batchSize) => {
  if (start === end) {
    return [[start, start + 1]];
  } else if (end - start + 1 <= batchSize) {
    return [[start, end + 1]];
  }

  const batches: any = [];

  for (let i = start; i < end + 1; i += batchSize) {
    batches.push([i, Math.min(i + batchSize - 1, end) + 1]);
  }

  return batches;
});

export class ChainListener extends AsyncTask {
  static fieldSchemas = {
    _rpc: z.instanceof(RPC),
    _coordinator: z.instanceof(Coordinator),
    _registry: z.instanceof(Registry),
    _reader: z.instanceof(Reader),
    _guardian: z.instanceof(Guardian),
    _processor: z.instanceof(ChainProcessor),
    _trail_head_blocks: z.bigint(),
    _snapshot_sync_sleep: z.number(),
    _snapshot_sync_batch_size: z.number(),
    _snapshot_sync_starting_sub_id: z.number(),
    _syncing_period: z.number(),
    _last_block: z.bigint(),
    _last_subscription_id: z.number(),
  };

  static methodSchemas = {
    _sync_batch_subscriptions_creation: z
      .function()
      .args(z.number(), z.number(), BlockNumberSchema)
      .returns(z.promise(z.void())),
    _snapshot_sync: z
      .function()
      .args(BlockNumberSchema)
      .returns(z.promise(z.void())),
    setup: z.function().returns(z.promise(z.void())),
    run_forever: z.function().returns(z.promise(z.void())),
    cleanup: z.function().returns(z.void()),
  };

  #rpc: z.infer<typeof ChainListener.fieldSchemas._rpc>;
  #coordinator: z.infer<typeof ChainListener.fieldSchemas._coordinator>;
  #registry: z.infer<typeof ChainListener.fieldSchemas._registry>;
  #reader: z.infer<typeof ChainListener.fieldSchemas._reader>;
  #guardian: z.infer<typeof ChainListener.fieldSchemas._guardian>;
  #processor: z.infer<typeof ChainListener.fieldSchemas._processor>;
  #trail_head_blocks: z.infer<
    typeof ChainListener.fieldSchemas._trail_head_blocks
  >;
  #snapshot_sync_sleep: z.infer<
    typeof ChainListener.fieldSchemas._snapshot_sync_sleep
  >;
  #snapshot_sync_batch_size: z.infer<
    typeof ChainListener.fieldSchemas._snapshot_sync_batch_size
  >;
  #snapshot_sync_starting_sub_id: z.infer<
    typeof ChainListener.fieldSchemas._snapshot_sync_starting_sub_id
  >;
  #syncing_period: z.infer<typeof ChainListener.fieldSchemas._syncing_period>;
  #last_block: z.infer<typeof ChainListener.fieldSchemas._last_block> = 0n;
  #last_subscription_id: z.infer<
    typeof ChainListener.fieldSchemas._last_subscription_id
  > = 0;

  constructor(
    rpc,
    coordinator,
    registry,
    reader,
    guardian,
    processor,
    trail_head_blocks,
    snapshot_sync
  ) {
    super();

    this.#rpc = ChainListener.fieldSchemas._rpc.parse(rpc);
    this.#coordinator =
      ChainListener.fieldSchemas._coordinator.parse(coordinator);
    this.#registry = ChainListener.fieldSchemas._registry.parse(registry);
    this.#reader = ChainListener.fieldSchemas._reader.parse(reader);
    this.#guardian = ChainListener.fieldSchemas._guardian.parse(guardian);
    this.#processor = ChainListener.fieldSchemas._processor.parse(processor);
    this.#trail_head_blocks =
      ChainListener.fieldSchemas._trail_head_blocks.parse(
        BigInt(trail_head_blocks)
      );
    this.#snapshot_sync_sleep =
      ChainListener.fieldSchemas._snapshot_sync_sleep.parse(
        snapshot_sync.sleep
      );
    this.#snapshot_sync_batch_size =
      ChainListener.fieldSchemas._snapshot_sync_batch_size.parse(
        snapshot_sync.batch_size
      );
    this.#snapshot_sync_starting_sub_id =
      ChainListener.fieldSchemas._snapshot_sync_starting_sub_id.parse(
        snapshot_sync.starting_sub_id
      );
    this.#syncing_period = ChainListener.fieldSchemas._syncing_period.parse(
      snapshot_sync.sync_period
    );

    console.info('Initialized ChainListener');
  }

  // Syncs a batch of subscriptions from `start_id` to `end_id` (does not include subscription with `end_id` in batch).
  #sync_batch_subscriptions_creation =
    ChainListener.methodSchemas._sync_batch_subscriptions_creation.implement(
      async (start_id, end_id, block_number) => {
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
            if (subscription.last_interval) {
              return {
                filteredIds: [...acc.filteredIds, subscription.id],
                filteredIntervals: [
                  ...acc.filteredIntervals,
                  subscription.interval,
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
          const msg = SubscriptionCreatedMessageSchema.parse({
            subscription,
            type: MessageType.SubscriptionCreated,
          });

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
    );

  // Snapshot syncs subscriptions from `Coordinator` up to the latest subscription read at the head block.
  #snapshot_sync = ChainListener.methodSchemas._snapshot_sync.implement(
    async (head_block) => {
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
  );

  // Set up listener by syncing subscriptions up to the head block number.
  setup = ChainListener.methodSchemas.setup.implement(async () => {
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

    // Setting this after snapshot, to avoid a 2nd full run of `run_forever` method.
    this.#last_subscription_id = headSubId;

    console.info('Finished snapshot sync', { new_head: headBlock });
  });

  // Core listener event loop.
  run_forever = ChainListener.methodSchemas.run_forever.implement(async () => {
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
          `No new blocks, sleeping for: ${
            this.#syncing_period / 1_000
          } seconds`,
          {
            head: headBlock,
            synced: this.#last_block,
            behind: this.#trail_head_blocks,
          }
        );

        await delay(this.#syncing_period);
      }
    }
  });

  cleanup = ChainListener.methodSchemas.cleanup.implement(() => {});
}
