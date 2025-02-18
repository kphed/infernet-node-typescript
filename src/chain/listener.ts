// Reference: https://github.com/ritual-net/infernet-node/blob/7753fef9ca3e1383843919bfbb2cc175f8dcd3b7/src/chain/listener.py.
import { BlockNumber } from 'viem';
import { Coordinator, ChainProcessor, Reader, Registry, RPC } from './index';
import { Guardian } from '../orchestration';
import { ConfigSnapshotSync } from '../shared/config';
import { GuardianError, SubscriptionCreatedMessage } from '../shared/message';
import { AsyncTask } from '../shared/service';

const SUBSCRIPTION_SYNC_BATCH_SIZE = 20;

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

class ChainListener extends AsyncTask {
  #rpc: RPC;
  #coordinator: Coordinator;
  #registry: Registry;
  #reader: Reader;
  #guardian: Guardian;
  #processor: ChainProcessor;
  #trail_head_blocks: number;
  #snapshot_sync_sleep: ConfigSnapshotSync;

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
    this.#trail_head_blocks = trail_head_blocks;
    this.#snapshot_sync_sleep = snapshot_sync;

    console.info('Initialized ChainListener');
  }

  setup(): void {}

  run_forever(): void {}

  cleanup(): void {}
}
