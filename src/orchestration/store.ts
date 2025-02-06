import { BaseMessage } from '../shared/message';

type JobLocation = 'offchain' | 'onchain';

type Status = 'success' | 'failed';

interface StatusCounter {
  success: number;
  failed: number;
}

interface JobCounters {
  offchain: StatusCounter;
  onchain: StatusCounter;
}

interface ContainerCounters {
  [key: string]: StatusCounter;
}

const PENDING_JOB_TTL = 15;

class KeyFormatter {
  /**
   * Format key for given message.
   * Concatenates address and message id to obtain unique key.
   */
  static format({ ip, id }: BaseMessage): string {
    return `${ip}:${id}`;
  }

  /**
   * Get message id from key.
   */
  static get_id(key: string): string {
    return key.split(':')[1];
  }

  /**
   * Match string for given address.
   */
  static matchstr_address(address: string): string {
    return `${address}:*`;
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
  increment_job_counter(status: Status, location: JobLocation): void {
    this.job_counters[location][status] += 1;
  }

  /**
   * Increment container counter.
   */
  increment_container_counter(status: Status, container: string): void {
    this.container_counters[container][status] += 1;
  }
}
