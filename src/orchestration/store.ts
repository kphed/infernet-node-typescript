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
    _default_job_counters: {
      returns: this.fieldSchemas.job_counters,
    },
    pop_job_counters: {
      returns: this.fieldSchemas.job_counters,
    },
    _default_container_counters: {
      returns: this.fieldSchemas.container_counters,
    },
    pop_container_counters: {
      returns: this.fieldSchemas.container_counters,
    },
    increment_job_counter: {
      args: {
        status: JobStatusSchema,
        location: z.union([z.literal('offchain'), z.literal('onchain')]),
      },
      returns: z.void(),
    },
    increment_container_counter: {
      args: {
        status: JobStatusSchema,
        container: z.string(),
      },
      returns: z.void(),
    },
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
  #default_job_counters(): z.infer<
    typeof DataStoreCounters.methodSchemas._default_job_counters.returns
  > {
    return DataStoreCounters.methodSchemas._default_job_counters.returns.parse({
      offchain: StatusCounterSchema.parse({}),
      onchain: StatusCounterSchema.parse({}),
    });
  }

  // Returns job counters and resets them.
  pop_job_counters(): z.infer<
    typeof DataStoreCounters.methodSchemas.pop_job_counters.returns
  > {
    const jobCounters = this.job_counters;
    this.job_counters = this.#default_job_counters();

    return DataStoreCounters.methodSchemas.pop_job_counters.returns.parse(
      jobCounters
    );
  }

  // Default value for the `container_counters` field.
  #default_container_counters(): z.infer<
    typeof DataStoreCounters.methodSchemas._default_container_counters.returns
  > {
    return new Proxy(
      {},
      {
        get: (target, prop) => {
          if (!(prop in target)) target[prop] = StatusCounterSchema.parse({});

          return target[prop];
        },
      }
    );
  }

  // Resets `container_counters` to its default, and returns its pre-reset value.
  pop_container_counters(): z.infer<
    typeof DataStoreCounters.methodSchemas.pop_container_counters.returns
  > {
    const containerCounters = this.container_counters;
    this.container_counters = this.#default_container_counters();

    return DataStoreCounters.methodSchemas.pop_container_counters.returns.parse(
      containerCounters
    );
  }

  // Increment job counter.
  increment_job_counter(
    status: z.infer<
      typeof DataStoreCounters.methodSchemas.increment_job_counter.args.status
    >,
    location: z.infer<
      typeof DataStoreCounters.methodSchemas.increment_job_counter.args.location
    >
  ): z.infer<
    typeof DataStoreCounters.methodSchemas.increment_job_counter.returns
  > {
    this.job_counters[location][status] += 1;
  }

  // Increment container counter.
  increment_container_counter(
    status: z.infer<
      typeof DataStoreCounters.methodSchemas.increment_container_counter.args.status
    >,
    container: z.infer<
      typeof DataStoreCounters.methodSchemas.increment_container_counter.args.container
    >
  ): z.infer<
    typeof DataStoreCounters.methodSchemas.increment_container_counter.returns
  > {
    this.container_counters[container][status] += 1;
  }
}

export class DataStore {
  static fieldSchemas = {
    counters: z.instanceof(DataStoreCounters),
    _onchain_pending: z.number(),
  };

  static methodSchemas = {
    setup: {
      returns: z.promise(z.void()),
    },
    get_pending_counters: {
      returns: z.promise(
        z
          .object({
            offchain: z.number(),
            onchain: z.number(),
          })
          .strict()
      ),
    },
    _set: {
      args: {
        message: OffchainMessageSchema,
        status: JobStatusSchema,
        results: ContainerResultSchema.array(),
      },
      returns: z.promise(z.void()),
    },
    get: {
      args: {
        messages: BaseMessageSchema.array(),
        intermediate: z.boolean().default(false),
      },
      returns: JobResultSchema.array(),
    },
    _get_pending: {
      args: {
        address: AddressSchema,
      },
      returns: z.string().array(),
    },
    _get_completed: {
      args: {
        address: AddressSchema,
      },
      returns: z.string().array(),
    },
    get_job_ids: {
      args: {
        address: AddressSchema,
        pending: z.boolean().optional(),
      },
      returns: z.string().array(),
    },
    set_running: {
      args: {
        message: OffchainMessageSchema,
      },
      returns: z.promise(z.void()),
    },
    set_success: {
      args: {
        message: OffchainMessageSchema.optional(),
        results: ContainerResultSchema.array(),
      },
      returns: z.promise(z.void()),
    },
    set_failed: {
      args: {
        message: OffchainMessageSchema.optional(),
        results: ContainerResultSchema.array(),
      },
      returns: z.promise(z.void()),
    },
    track_container_status: {
      args: {
        container: z.string(),
        status: JobStatusSchema,
      },
      returns: z.void(),
    },
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
  async setup(): z.infer<typeof DataStore.methodSchemas.setup.returns> {
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
  }

  // Returns pending counters for onchain and offchain jobs.
  async get_pending_counters(): z.infer<
    typeof DataStore.methodSchemas.get_pending_counters.returns
  > {
    return DataStore.methodSchemas.get_pending_counters.returns.parse({
      offchain: await this.#pending.dbSize(),
      onchain: this.#onchain_pending,
    });
  }

  // Set job data.
  async #set(
    message: z.infer<typeof DataStore.methodSchemas._set.args.message>,
    status: z.infer<typeof DataStore.methodSchemas._set.args.status>,
    results: z.infer<typeof DataStore.methodSchemas._set.args.results> = []
  ): z.infer<typeof DataStore.methodSchemas._set.returns> {
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

  // Get job data.
  async get(
    messages: z.infer<typeof DataStore.methodSchemas.get.args.messages>,
    intermediate: z.infer<typeof DataStore.methodSchemas.get.args.intermediate>
  ): Promise<z.infer<typeof DataStore.methodSchemas.get.returns>> {
    const keys = messages.map((message) => KeyFormatter.format(message));
    const jobs = ((await this.#completed.mGet(keys)) ?? []).concat(
      (await this.#pending.mGet(keys)) ?? []
    );

    return DataStore.methodSchemas.get.returns.parse(
      jobs.reduce((acc, val: string | null) => {
        if (!val) return acc;

        const jobResult = JSON.parse(val);

        return acc.concat({
          ...jobResult,
          intermediate_results: !intermediate
            ? []
            : jobResult.intermediate_results,
        });
      }, [])
    );
  }

  // Get all pending job IDs for a given address.
  async #get_pending(
    address: z.infer<typeof DataStore.methodSchemas._get_pending.args.address>
  ): Promise<z.infer<typeof DataStore.methodSchemas._get_pending.returns>> {
    const scan = await this.#pending.scanIterator({
      MATCH: KeyFormatter.matchstr_address(address),
    });
    const ids: string[] = [];

    for await (const key of scan) {
      ids.push(KeyFormatter.get_id(key));
    }

    return DataStore.methodSchemas._get_pending.returns.parse(ids);
  }

  // Get all completed job IDs for a given address.
  async #get_completed(
    address: z.infer<typeof DataStore.methodSchemas._get_completed.args.address>
  ): Promise<z.infer<typeof DataStore.methodSchemas._get_completed.returns>> {
    const scan = await this.#completed.scanIterator({
      MATCH: KeyFormatter.matchstr_address(address),
    });
    const ids: string[] = [];

    for await (const key of scan) {
      ids.push(KeyFormatter.get_id(key));
    }

    return DataStore.methodSchemas._get_completed.returns.parse(ids);
  }

  // Get pending, complete, or all job IDs for a given address.
  async get_job_ids(
    address: z.infer<typeof DataStore.methodSchemas.get_job_ids.args.address>,
    pending?: z.infer<typeof DataStore.methodSchemas.get_job_ids.args.pending>
  ): Promise<z.infer<typeof DataStore.methodSchemas.get_job_ids.returns>> {
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

    return DataStore.methodSchemas.get_job_ids.returns.parse(jobIds);
  }

  // Set a job's status to "running".
  async set_running(
    message?: z.infer<typeof DataStore.methodSchemas.set_running.args.message>
  ): z.infer<typeof DataStore.methodSchemas.set_running.returns> {
    if (message) {
      await this.#set(message, 'running');
    } else {
      this.#onchain_pending += 1;
    }
  }

  // Set a job's status to "success".
  async set_success(
    message: z.infer<typeof DataStore.methodSchemas.set_success.args.message>,
    results: z.infer<typeof DataStore.methodSchemas.set_success.args.results>
  ): z.infer<typeof DataStore.methodSchemas.set_success.returns> {
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

  // Set a job's status to "failed".
  async set_failed(
    message: z.infer<typeof DataStore.methodSchemas.set_failed.args.message>,
    results: z.infer<typeof DataStore.methodSchemas.set_failed.args.results>
  ): z.infer<typeof DataStore.methodSchemas.set_failed.returns> {
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

  // Track a container's status.
  track_container_status(
    container: z.infer<
      typeof DataStore.methodSchemas.track_container_status.args.container
    >,
    status: z.infer<
      typeof DataStore.methodSchemas.track_container_status.args.status
    >
  ): z.infer<typeof DataStore.methodSchemas.track_container_status.returns> {
    this.counters.increment_container_counter(status, container);
  }
}
