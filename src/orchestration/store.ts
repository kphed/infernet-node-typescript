// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/orchestration/store.py.
import { z } from 'zod';
import { createClient, RedisClientType } from 'redis';
import {
  JobStatusSchema,
  ContainerResultSchema,
  JobResultSchema,
} from '../shared/job';
import { BaseMessageSchema, OffchainMessageSchema } from '../shared/message';
import { AddressSchema } from '../shared/schemas';

const StatusCounterSchema = z
  .object({
    success: z.number().default(0),
    failed: z.number().default(0),
  })
  .strict();

class KeyFormatter {
  static methodSchemas = {
    format: z
      .function()
      .args(BaseMessageSchema)
      .returns(z.string().includes(':')),
    get_id: z.function().args(z.string()).returns(z.string()),
    matchstr_address: z.function().args(AddressSchema).returns(z.string()),
  };

  // Concatenates address and message id to obtain unique key.
  static format = KeyFormatter.methodSchemas.format.implement(
    (ip, id) => `${ip}:${id}`
  );

  // Get message id from key.
  static get_id = KeyFormatter.methodSchemas.get_id.implement(
    (key) => key.split(':')[1]
  );

  // Match string for given address.
  static matchstr_address =
    KeyFormatter.methodSchemas.matchstr_address.implement(
      (address) => `${address}:*`
    );
}

class DataStoreCounters {
  static fieldSchemas = {
    job_counters: z
      .object({
        offchain: StatusCounterSchema,
        onchain: StatusCounterSchema,
      })
      .strict(),
    container_counters: z.record(StatusCounterSchema),
  };

  static methodSchemas = {
    _default_job_counters: z.function().returns(this.fieldSchemas.job_counters),
    pop_job_counters: z.function().returns(this.fieldSchemas.job_counters),
    _default_container_counters: z
      .function()
      .returns(this.fieldSchemas.container_counters),
    pop_container_counters: z
      .function()
      .returns(this.fieldSchemas.container_counters),
    increment_job_counter: z
      .function()
      .args(
        JobStatusSchema,
        z.union([z.literal('offchain'), z.literal('onchain')])
      ),
    increment_container_counter: z.function().args(JobStatusSchema, z.string()),
  };

  job_counters: z.infer<typeof DataStoreCounters.fieldSchemas.job_counters>;
  container_counters: z.infer<
    typeof DataStoreCounters.fieldSchemas.container_counters
  >;

  constructor() {
    this.job_counters = this.#default_job_counters();
    this.container_counters = this.#default_container_counters();
  }

  // Default value for the `job_counters` field.
  #default_job_counters =
    DataStoreCounters.methodSchemas._default_job_counters.implement(() => ({
      offchain: StatusCounterSchema.parse({}),
      onchain: StatusCounterSchema.parse({}),
    }));

  // Returns job counters and resets them.
  pop_job_counters = DataStoreCounters.methodSchemas.pop_job_counters.implement(
    () => {
      const jobCounters = this.job_counters;
      this.job_counters = this.#default_job_counters();

      return jobCounters;
    }
  );

  // Default value for the `container_counters` field.
  #default_container_counters =
    DataStoreCounters.methodSchemas._default_container_counters.implement(
      () =>
        new Proxy(
          {},
          {
            get: (target, prop) => {
              if (!(prop in target))
                target[prop] = StatusCounterSchema.parse({});

              return target[prop];
            },
          }
        )
    );

  // Resets `container_counters` to its default, and returns its pre-reset value.
  pop_container_counters =
    DataStoreCounters.methodSchemas.pop_container_counters.implement(() => {
      const containerCounters = this.container_counters;
      this.container_counters = this.#default_container_counters();

      return containerCounters;
    });

  // Increment job counter.
  increment_job_counter =
    DataStoreCounters.methodSchemas.increment_job_counter.implement(
      (status, location) => {
        this.job_counters[location][status] += 1;
      }
    );

  // Increment container counter.
  increment_container_counter =
    DataStoreCounters.methodSchemas.increment_container_counter.implement(
      (status, container) => {
        this.container_counters[container][status] += 1;
      }
    );
}

export class DataStore {
  static fieldSchemas = {
    counters: z.instanceof(DataStoreCounters),
    _onchain_pending: z.number(),
  };

  static methodSchemas = {
    setup: z.function().returns(z.promise(z.void())),
    get_pending_counters: z.function().returns(
      z.promise(
        z
          .object({
            offchain: z.number(),
            onchain: z.number(),
          })
          .strict()
      )
    ),
    _set: z
      .function()
      .args(
        OffchainMessageSchema,
        JobStatusSchema,
        ContainerResultSchema.array()
      )
      .returns(z.promise(z.void())),
    get: z
      .function()
      .args(BaseMessageSchema.array(), z.boolean().default(false))
      .returns(z.promise(JobResultSchema.array())),
    _get_pending: z
      .function()
      .args(AddressSchema)
      .returns(z.promise(z.string().array())),
    _get_completed: z
      .function()
      .args(AddressSchema)
      .returns(z.promise(z.string().array())),
    get_job_ids: z
      .function()
      .args(AddressSchema, z.boolean().optional())
      .returns(z.promise(z.string().array())),
    set_running: z
      .function()
      .args(OffchainMessageSchema.optional())
      .returns(z.promise(z.void())),
    set_success: z
      .function()
      .args(OffchainMessageSchema.optional(), ContainerResultSchema.array())
      .returns(z.promise(z.void())),
    set_failed: z
      .function()
      .args(OffchainMessageSchema.optional(), ContainerResultSchema.array())
      .returns(z.promise(z.void())),
    track_container_status: z.function().args(z.string(), JobStatusSchema),
  };

  counters: z.infer<typeof DataStore.fieldSchemas.counters>;
  #onchain_pending: z.infer<typeof DataStore.fieldSchemas._onchain_pending>;
  #completed: RedisClientType;
  #pending: RedisClientType;

  constructor(host: string, port: number) {
    this.counters = DataStore.fieldSchemas.counters.parse(
      new DataStoreCounters()
    );
    this.#onchain_pending = DataStore.fieldSchemas._onchain_pending.parse(0);

    // Needs to be set up by calling `setup_redis_clients` first.
    this.#completed = createClient({ socket: { host, port }, database: 0 });
    this.#pending = createClient({ socket: { host, port }, database: 1 });
  }

  // Set up Redis clients for completed and pending jobs.
  setup = DataStore.methodSchemas.setup.implement(async () => {
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

    console.log('Initialized Redis clients');
  });

  // Returns pending counters for onchain and offchain jobs.
  get_pending_counters = DataStore.methodSchemas.get_pending_counters.implement(
    async () => ({
      offchain: await this.#pending.dbSize(),
      onchain: this.#onchain_pending,
    })
  );

  // Set job data.
  #set = DataStore.methodSchemas._set.implement(
    async (message, status, results) => {
      // Convert job result object into a string type so that it can be stored.
      const job = JSON.stringify(
        JobResultSchema.parse({
          id: message.id,
          status,
          intermediate_results: results.slice(0, results.length - 1),
          result: results[results.length - 1],
        })
      );
      const formattedMessage = KeyFormatter.format(message);

      if (status === 'running') {
        // Set job as pending. Expiration time is 15 minutes (900 seconds).
        await this.#pending.setEx(formattedMessage, 900, job);
      } else {
        // Remove job from pending.
        await this.#pending.del(formattedMessage);

        // Set job as completed.
        await this.#completed.set(formattedMessage, job);
      }
    }
  );

  // Get job data.
  get = DataStore.methodSchemas.get.implement(
    async (messages, intermediate) => {
      const keys = messages.map((message) => KeyFormatter.format(message));
      const jobs = ((await this.#completed.mGet(keys)) ?? []).concat(
        (await this.#pending.mGet(keys)) ?? []
      );

      return jobs.reduce((acc, val: string | null) => {
        if (!val) return acc;

        const jobResult = JSON.parse(val);

        return acc.concat({
          ...jobResult,
          intermediate_results: !intermediate
            ? []
            : jobResult.intermediate_results,
        });
      }, []);
    }
  );

  // Get all pending job IDs for a given address.
  #get_pending = DataStore.methodSchemas._get_pending.implement(
    async (address) => {
      const scan = await this.#pending.scanIterator({
        MATCH: KeyFormatter.matchstr_address(address),
      });
      const ids: string[] = [];

      for await (const key of scan) {
        ids.push(KeyFormatter.get_id(key));
      }

      return ids;
    }
  );

  // Get all completed job IDs for a given address.
  #get_completed = DataStore.methodSchemas._get_completed.implement(
    async (address) => {
      const scan = await this.#completed.scanIterator({
        MATCH: KeyFormatter.matchstr_address(address),
      });
      const ids: string[] = [];

      for await (const key of scan) {
        ids.push(KeyFormatter.get_id(key));
      }

      return ids;
    }
  );

  // Get pending, complete, or all job IDs for a given address.
  get_job_ids = DataStore.methodSchemas.get_job_ids.implement(
    async (address, pending) => {
      let jobIds;

      if (pending) {
        jobIds = await this.#get_pending(address);
      } else if (pending === false) {
        jobIds = await this.#get_completed(address);
      } else {
        jobIds = (await this.#get_pending(address)).concat(
          await this.#get_completed(address)
        );
      }

      return jobIds;
    }
  );

  // Set a job's status to "running".
  set_running = DataStore.methodSchemas.set_running.implement(
    async (message) => {
      if (message) {
        await this.#set(message, 'running', []);
      } else {
        this.#onchain_pending += 1;
      }
    }
  );

  // Set a job's status to "success".
  set_success = DataStore.methodSchemas.set_success.implement(
    async (message, results) => {
      const successStatus = JobStatusSchema.parse('success');

      if (message) {
        await this.#set(message, successStatus, results);
      } else {
        this.#onchain_pending -= 1;
      }

      this.counters.increment_job_counter(
        successStatus,
        message ? 'offchain' : 'onchain'
      );
    }
  );

  // Set a job's status to "failed".
  set_failed = DataStore.methodSchemas.set_failed.implement(
    async (message, results) => {
      const failedStatus = JobStatusSchema.parse('failed');

      if (message) {
        await this.#set(message, failedStatus, results);
      } else {
        this.#onchain_pending -= 1;
      }

      this.counters.increment_job_counter(
        failedStatus,
        message ? 'offchain' : 'onchain'
      );
    }
  );

  // Track a container's status.
  track_container_status =
    DataStore.methodSchemas.track_container_status.implement(
      (container, status) => {
        this.counters.increment_container_counter(status, container);
      }
    );
}
