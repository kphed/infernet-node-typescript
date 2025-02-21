// Reference: https://github.com/ritual-net/infernet-node/blob/0a5c6cba32e48561338142ef6fabeba3a11057e4/src/orchestration/orchestrator.py.
import { z } from 'zod';
import {
  ContainerError,
  ContainerOutput,
  ContainerResult,
  ContainerInput,
  JobInput,
  JobLocation,
  JobInputSchema,
  ContainerResultSchema,
  ContainerInputSchema,
  ContainerErrorSchema,
} from '../shared/job';
import {
  OffchainJobMessage,
  OffchainJobMessageSchema,
} from '../shared/message';
import { ContainerManager } from './docker';
import { DataStore } from './store';

// 3 minutes.
const RUN_JOB_TIMEOUT = 180_000;

// 1 minute.
const PROCESS_STREAMING_JOB_TIMEOUT = 60_000;

export class Orchestrator {
  static fieldSchemas = {
    _manager: z.instanceof(ContainerManager),
    _store: z.instanceof(DataStore),
    _host: z.string(),
  };

  static methodSchemas = {
    _get_container_url: {
      args: {
        container: z.string(),
      },
      returns: z.string().url(),
    },
    _get_headers: {
      args: {
        container: z.string(),
      },
      returns: z
        .object({
          'Content-Type': z.string(),
          Authorization: z.string().optional(),
        })
        .strict(),
    },
    _run_job: {
      args: {
        job_id: z.any(),
        job_input: JobInputSchema,
        containers: z.string().array(),
        message: OffchainJobMessageSchema.optional(),
        requires_proof: z.boolean().optional(),
      },
      returns: ContainerResultSchema.array(),
    },
  };

  #manager: ContainerManager;
  #store: DataStore;
  #host: string;

  constructor(manager, store) {
    this.#manager = Orchestrator.fieldSchemas._manager.parse(manager);
    this.#store = Orchestrator.fieldSchemas._store.parse(store);

    // Set host based on runtime environment.
    this.#host = Orchestrator.fieldSchemas._host.parse(
      process.env.RUNTIME === 'docker' ? 'host.docker.internal' : 'localhost'
    );
  }

  // Get the service output URL for the specified container.
  #get_container_url(
    container: z.infer<
      typeof Orchestrator.methodSchemas._get_container_url.args.container
    >
  ): z.infer<typeof Orchestrator.methodSchemas._get_container_url.returns> {
    const container_url = this.#manager.get_url(container);
    let serviceOutputUrl;

    if (container_url) {
      serviceOutputUrl = `${container_url}/service_output`;
    } else {
      const port = this.#manager.get_port(container);
      serviceOutputUrl = `http://${this.#host}:${port}/service_output`;
    }

    return Orchestrator.methodSchemas._get_container_url.returns.parse(
      serviceOutputUrl
    );
  }

  // Get the headers for the specified container, including bearer token if available.
  #get_headers(
    container: z.infer<
      typeof Orchestrator.methodSchemas._get_headers.args.container
    >
  ): z.infer<typeof Orchestrator.methodSchemas._get_headers.returns> {
    const bearer = this.#manager.get_bearer(container);
    const headers: z.infer<
      typeof Orchestrator.methodSchemas._get_headers.returns
    > = { 'Content-Type': 'application/json' };

    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    return Orchestrator.methodSchemas._get_headers.returns.parse(headers);
  }

  // Runs a job by calling containers sequentially, piping their outputs into one another.
  async #run_job(
    job_id: z.infer<typeof Orchestrator.methodSchemas._run_job.args.job_id>,
    job_input: z.infer<
      typeof Orchestrator.methodSchemas._run_job.args.job_input
    >,
    containers: z.infer<
      typeof Orchestrator.methodSchemas._run_job.args.containers
    >,
    message?: z.infer<typeof Orchestrator.methodSchemas._run_job.args.message>,
    requires_proof?: z.infer<
      typeof Orchestrator.methodSchemas._run_job.args.requires_proof
    >
  ): Promise<z.infer<typeof Orchestrator.methodSchemas._run_job.returns>> {
    await this.#store.set_running(message);

    const results: ContainerResult[] = [];

    // If only one container, destination of first container is destination of job.
    // Otherwise, destination of first container is off-chain, and source of next
    // container is off-chain (i.e. chaining containers together).
    let inputData: ContainerInput = ContainerInputSchema.parse({
      source: job_input.source,
      destination:
        containers.length === 1 ? job_input.destination : JobLocation.OFFCHAIN,
      data: job_input.data,
      requires_proof: !!requires_proof,
    });

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const url = this.#get_container_url(container);
      const headers = this.#get_headers(container);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RUN_JOB_TIMEOUT);
      let response;

      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(inputData),
          signal: controller.signal,
        });

        // Clear to avoid dangling timers.
        clearTimeout(timeout);

        const output = await response.json();

        results.push(ContainerResultSchema.parse({ container, output }));

        this.#store.track_container_status(container, 'success');

        // If next container is the last container, set destination to
        // job destination. Otherwise, set destination to off-chain
        // (i.e. chaining containers together)
        inputData = ContainerInputSchema.parse({
          source: JobLocation.OFFCHAIN,
          destination:
            i === containers.length - 2
              ? job_input.destination
              : JobLocation.OFFCHAIN,
          data: output,
          requires_proof: !!requires_proof,
        });
      } catch (err: any) {
        clearTimeout(timeout);

        const containerError: ContainerError = {
          container,
          error: '',
        };

        // Handle non-JSON response as error.
        if (err instanceof SyntaxError && response) {
          containerError.error = await response.text();
        } else {
          containerError.error = err.message || String(err);
        }

        results.push(ContainerErrorSchema.parse(containerError));

        console.error('Container error', {
          id: job_id,
          ...containerError,
        });

        await this.#store.set_failed(message, results);

        this.#store.track_container_status(container, 'failed');

        return Orchestrator.methodSchemas._run_job.returns.parse(results);
      }
    }

    await this.#store.set_success(message, results);

    return Orchestrator.methodSchemas._run_job.returns.parse(results);
  }

  /**
   * Processes arbitrary job from ChainProcessor.
   */
  process_chain_processor_job(
    job_id: any,
    job_input: JobInput,
    containers: string[],
    requires_proof: boolean
  ): Promise<ContainerResult[]> {
    return this.#run_job(
      job_id,
      job_input,
      containers,
      undefined,
      requires_proof
    );
  }

  /**
   * Processes off-chain job message.
   */
  async process_offchain_job(message: OffchainJobMessage): Promise<void> {
    await this.#run_job(
      message.id,
      {
        source: JobLocation.OFFCHAIN,
        destination: JobLocation.OFFCHAIN,
        data: message.data,
      } as JobInput,
      message.containers,
      message,
      message.requires_proof
    );
  }

  /**
   * Runs a streaming job.
   *
   * Calls streaming container and yields chunks of output as they are received. If
   * the container fails, the job is marked as failed. If the container succeeds, the
   * job is marked as successful, and the full output is stored in Redis as an array
   * of chunks.
   *
   * NOTE: If multiple containers are specified in the message, only the first
   * container is executed, the rest are ignored.
   */
  async process_streaming_job(message: OffchainJobMessage) {
    const [container] = message.containers;
    const url = this.#get_container_url(container);
    const headers = this.#get_headers(container);

    await this.#store.set_running(message);

    try {
      const job_input: JobInput = {
        source: JobLocation.OFFCHAIN,
        destination: JobLocation.STREAM,
        data: message.data,
      };
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        PROCESS_STREAMING_JOB_TIMEOUT
      );
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(job_input),
        signal: controller.signal,
      });

      if (response.status !== 200) throw new Error('Response status not OK.');
      if (!response.body) throw new Error('No response body.');

      clearTimeout(timeout);

      const chunks: Buffer[] = [];

      for await (const chunk of response.body) {
        chunks.push(Buffer.from(chunk));
      }

      const output = Buffer.concat(chunks).toString('utf-8');

      await this.#store.set_success(message, [
        {
          container,
          output: JSON.parse(output),
        } as ContainerOutput,
      ]);

      this.#store.track_container_status(container, 'success');
    } catch (err: any) {
      const error = err.message || String(err);

      console.error('Container error', {
        id: message.id,
        container,
        error,
      });

      await this.#store.set_failed(message, [
        {
          container,
          error,
        } as ContainerError,
      ]);

      this.#store.track_container_status(container, 'failed');
    }
  }

  /**
   * Collects service resources from running containers.
   *
   * Calls each container's /service-resources endpoint to retrieve its resources.
   * If model ID is specified, checks whether that model is supported instead.
   */
  async collect_service_resources(model_id?: string): Promise<{
    [key: string]: any;
  }> {
    const runningContainerIds: string[] =
      await this.#manager.running_containers();

    const makeContainerUrl = (containerId: string): string => {
      const port = this.#manager.get_port(containerId);
      const baseUrl = `http://${this.#host}:${port}/service-resources`;

      return model_id ? `${baseUrl}?model_id=${model_id}` : baseUrl;
    };

    const containerResources = await Promise.all(
      runningContainerIds.map(async (containerId) => {
        const url = makeContainerUrl(containerId);

        try {
          const response = await fetch(url);

          if (response.status !== 200)
            throw new Error('Response status not OK.');

          return [containerId, await response.json()];
        } catch (err) {
          console.error(`Error fetching data from ${url}: ${err}`);
        }
      })
    );

    return containerResources.reduce((acc, val) => {
      if (!val) return acc;

      const [containerId, data] = val;

      return {
        ...acc,
        [containerId]: data,
      };
    }, {});
  }
}
