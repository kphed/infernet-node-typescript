// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/orchestration/store.py.
import { z } from 'zod';
import { createClient, RedisClientType } from 'redis';
import { JobResult, JobStatus, ContainerResult } from '../shared/job';
import {
  BaseMessage,
  BaseMessageSchema,
  OffchainMessage,
} from '../shared/message';
import { AddressSchema } from '../shared/schemas';

const StatusCounterSchema = z
  .object({
    success: z.number(),
    failed: z.number(),
  })
  .strict();

const JobCountersSchema = z
  .object({
    offchain: StatusCounterSchema,
    onchain: StatusCounterSchema,
  })
  .strict();

const ContainerCountersSchema = z.object({}).catchall(StatusCounterSchema);

type StatusCounter = z.infer<typeof StatusCounterSchema>;

type JobCounters = z.infer<typeof JobCountersSchema>;

type ContainerCounters = z.infer<typeof ContainerCountersSchema>;

// 15 minutes in seconds.
const PENDING_JOB_TTL = 900;

class KeyFormatter {
  static methodSchemas = {
    format: {
      args: {
        message: BaseMessageSchema,
      },
      returns: z.string().includes(':'),
    },
    get_id: {
      args: {
        key: z.string(),
      },
      returns: z.string(),
    },
    matchstr_address: {
      args: {
        address: AddressSchema,
      },
      returns: z.string(),
    },
  };

  // Concatenates address and message id to obtain unique key.
  static format({
    ip,
    id,
  }: z.infer<typeof KeyFormatter.methodSchemas.format.args.message>): z.infer<
    typeof KeyFormatter.methodSchemas.format.returns
  > {
    return KeyFormatter.methodSchemas.format.returns.parse(`${ip}:${id}`);
  }

  // Get message id from key.
  static get_id(
    key: z.infer<typeof KeyFormatter.methodSchemas.get_id.args.key>
  ): z.infer<typeof KeyFormatter.methodSchemas.get_id.returns> {
    return KeyFormatter.methodSchemas.get_id.returns.parse(key.split(':')[1]);
  }

  // Match string for given address.
  static matchstr_address(
    address: z.infer<
      typeof KeyFormatter.methodSchemas.matchstr_address.args.address
    >
  ): z.infer<typeof KeyFormatter.methodSchemas.matchstr_address.returns> {
    return KeyFormatter.methodSchemas.matchstr_address.returns.parse(
      `${address}:*`
    );
  }
}

class DataStoreCounters {
  job_counters: JobCounters;
  container_counters: ContainerCounters;

  constructor() {
    this.job_counters = this.#default_job_counters();
    this.container_counters = this.#default_container_counters();
  }

  /**
   * Default value for job counters.
   */
  #default_job_counters(): JobCounters {
    return {
      offchain: { success: 0, failed: 0 },
      onchain: { success: 0, failed: 0 },
    };
  }

  /**
   * Returns job counters and resets them.
   */
  pop_job_counters(): JobCounters {
    const jobCounters = this.job_counters;
    this.job_counters = this.#default_job_counters();

    return jobCounters;
  }

  /**
   * Default value for container counters.
   */
  #default_container_counters(): ContainerCounters {
    // Enables the incrementing of counters for arbitrary container ids.
    return new Proxy(
      {},
      {
        get: (target, prop) => {
          if (prop in target) return target[prop];

          target[prop] = {
            success: 0,
            failed: 0,
          };

          return target[prop];
        },
      }
    );
  }

  /**
   * Returns container counters and resets them.
   */
  pop_container_counters(): ContainerCounters {
    const containerCounters = this.container_counters;
    this.container_counters = this.#default_container_counters();

    return containerCounters;
  }

  /**
   * Increment job counter.
   */
  increment_job_counter(
    status: JobStatus,
    location: 'offchain' | 'onchain'
  ): void {
    this.job_counters[location][status] += 1;
  }

  /**
   * Increment container counter.
   */
  increment_container_counter(status: JobStatus, container: string): void {
    this.container_counters[container][status] += 1;
  }
}

export class DataStore {
  counters: DataStoreCounters;
  #onchain_pending: number;
  #completed: RedisClientType;
  #pending: RedisClientType;

  constructor(host: string, port: number) {
    this.counters = new DataStoreCounters();
    this.#onchain_pending = 0;

    // Needs to be set up by calling `setup_redis_clients` first.
    this.#completed = createClient({ socket: { host, port }, database: 0 });
    this.#pending = createClient({ socket: { host, port }, database: 1 });
  }

  /**
   * Set up Redis clients for completed and pending jobs.
   */
  async setup_redis_clients(): Promise<void> {
    try {
      // Connect to the databases.
      await this.#completed.connect();
      await this.#pending.connect();

      // Check connection.
      await this.#completed.ping();
      await this.#pending.ping();

      // Flush pending jobs DB.
      await this.#pending.flushDb();
    } catch (err) {
      throw new Error(
        'Could not set up Redis. Please check your configuration.'
      );
    }

    console.log(`Initialized Redis clients`);
  }

  /**
   * Returns pending counters for onchain and offchain jobs.
   */
  async get_pending_counters(): Promise<{
    offchain: number;
    onchain: number;
  }> {
    return {
      offchain: await this.#pending.dbSize(),
      onchain: this.#onchain_pending,
    };
  }

  /**
   * Private method to set job data.
   *
   * Sets job data to Redis. If status is "running", sets job as pending. If status
   * is "success" or "failed", sets job as completed, and removes it from pending.
   *
   * NOTE: Pending jobs are set with an expiration time of PENDING_JOB_TTL,
   * which is a loose upper bound on the time it should take for a job to complete.
   * This is to ensure crashes and / or incorrect use of the `/status` endpoint do
   * not leave jobs in a pending state indefinitely.
   */
  async #set(
    message: OffchainMessage,
    status: JobStatus,
    results: ContainerResult[] = []
  ): Promise<void> {
    const job = JSON.stringify({
      id: message.id,
      status,
      intermediate_results: results.slice(0, results.length - 1),
      result: results[results.length - 1],
    } as JobResult);
    const formattedMessage = KeyFormatter.format(message);

    try {
      if (status === 'running') {
        // Set job as pending. Expiration time is PENDING_JOB_TTL.
        await this.#pending.setEx(formattedMessage, PENDING_JOB_TTL, job);
      } else {
        // Remove job from pending.
        await this.#pending.del(formattedMessage);

        // Set job as completed.
        await this.#completed.set(formattedMessage, job);
      }
    } catch (err) {
      console.error(`Failed to set job data in Redis DB`, err);

      throw err;
    }
  }

  /**
   * Get job data
   *
   * Returns job data from Redis for specified job IDs. Checks pending and completed
   * jobs DBs. Ignores jobs that are not found. Optionally returns intermediate
   * results.
   */
  async get(
    messages: BaseMessage[],
    intermediate: boolean = false
  ): Promise<JobResult[]> {
    try {
      const keys = messages.map((message) => KeyFormatter.format(message));
      const completedJobs = (await this.#completed.mGet(keys)) ?? [];
      const pendingJobs = (await this.#pending.mGet(keys)) ?? [];
      const parsedJobs: JobResult[] = completedJobs
        .concat(pendingJobs)
        .reduce(
          (acc: JobResult[], val: string | null) =>
            !val ? acc : [...acc, JSON.parse(val)],
          []
        );

      if (!intermediate)
        return parsedJobs.map((job) => ({
          ...job,
          intermediate_results: [],
        }));

      return parsedJobs;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Get all pending job IDs for given address.
   */
  async #get_pending(
    address: z.infer<typeof AddressSchema>
  ): Promise<string[]> {
    try {
      const scan = await this.#pending.scanIterator({
        MATCH: KeyFormatter.matchstr_address(address),
      });
      const ids: string[] = [];

      for await (const key of scan) {
        ids.push(KeyFormatter.get_id(key));
      }

      return ids;
    } catch (err) {
      console.log('Unable to get pending job IDs', err);

      throw err;
    }
  }

  /**
   * Get all completed job IDs for given address
   */
  async #get_completed(
    address: z.infer<typeof AddressSchema>
  ): Promise<string[]> {
    try {
      const scan = await this.#completed.scanIterator({
        MATCH: KeyFormatter.matchstr_address(address),
      });
      const ids: string[] = [];

      for await (const key of scan) {
        ids.push(KeyFormatter.get_id(key));
      }

      return ids;
    } catch (err) {
      console.log('Unable to get completed job IDs', err);

      throw err;
    }
  }

  /**
   * Get all job IDs for given address.
   *
   * Optionally filter by pending or completed job status. If pending is undefined,
   * returns all job IDs.
   */
  async get_job_ids(
    address: z.infer<typeof AddressSchema>,
    pending?: boolean
  ): Promise<string[]> {
    if (pending === true) {
      return this.#get_pending(address);
    } else if (pending === false) {
      return this.#get_completed(address);
    }

    try {
      const pendingJobIds = await this.#get_pending(address);
      const completedJobIds = await this.#get_completed(address);

      return pendingJobIds.concat(completedJobIds);
    } catch (err) {
      console.log('Unable to get job IDs', err);

      throw err;
    }
  }

  /**
   * Track running job, store in pending jobs cache if offchain.
   */
  async set_running(message?: OffchainMessage): Promise<void> {
    if (message) {
      await this.#set(message, 'running');
    } else {
      this.#onchain_pending += 1;
    }
  }

  /**
   * Track successful job, store in completed jobs cache if offchain.
   */
  async set_success(
    message: OffchainMessage | undefined,
    results: ContainerResult[]
  ): Promise<void> {
    const successStatus: JobStatus = 'success';

    if (message) {
      await this.#set(message, successStatus, results);
      this.counters.increment_job_counter(successStatus, 'offchain');
    } else {
      this.#onchain_pending -= 1;

      this.counters.increment_job_counter(successStatus, 'onchain');
    }
  }

  /**
   * Track failed job, store in completed jobs cache if offchain.
   */
  async set_failed(
    message: OffchainMessage | undefined,
    results: ContainerResult[]
  ): Promise<void> {
    const failedStatus: JobStatus = 'failed';

    if (message) {
      await this.#set(message, failedStatus, results);
      this.counters.increment_job_counter(failedStatus, 'offchain');
    } else {
      this.#onchain_pending -= 1;

      this.counters.increment_job_counter(failedStatus, 'onchain');
    }
  }

  /**
   * Track container status.
   */
  track_container_status(container: string, status: JobStatus): void {
    this.counters.increment_container_counter(status, container);
  }
}
