// Reference: https://github.com/ritual-net/infernet-node/blob/0a5c6cba32e48561338142ef6fabeba3a11057e4/src/orchestration/orchestrator.py.
import {
  ContainerError,
  ContainerOutput,
  ContainerResult,
  ContainerInput,
  JobInput,
  JobLocation,
} from '../shared/job';
import { OffchainJobMessage } from '../shared/message';
import { ContainerManager } from './docker';
import { DataStore } from './store';

// 3 minutes.
const RUN_JOB_TIMEOUT = 180_000;

// 1 minute.
const PROCESS_STREAMING_JOB_TIMEOUT = 60_000;

export class Orchestrator {
  #manager: ContainerManager;
  #store: DataStore;
  #host: string;

  constructor(manager: ContainerManager, store: DataStore) {
    this.#manager = manager;
    this.#store = store;

    // Set host based on runtime environment.
    this.#host =
      process.env.RUNTIME === 'docker' ? 'host.docker.internal' : 'localhost';
  }

  /**
   * Get the service output URL for the specified container.
   *
   * If a custom URL is defined in container config, use this.
   * Otherwise, retrieve the port for the container and construct the URL using the
   * host and port.
   */
  #get_container_url(container: string): string {
    const container_url = this.#manager.get_url(container);
    const routeName = 'service_output';

    if (container_url) return `${container_url}/${routeName}`;

    const port = this.#manager.get_port(container);

    return `http://${this.#host}:${port}/${routeName}`;
  }

  /**
   * Get the headers for the specified container, including Bearer authorization if available.
   *
   * The headers will always include the 'Content-Type' set to 'application/json'.
   * If the container has a Bearer token, it is included in the 'Authorization' header.
   */
  #get_headers(container: string): { [key: string]: string } {
    const bearer = this.#manager.get_bearer(container);
    const headers = { 'Content-Type': 'application/json' };

    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;

    return headers;
  }

  /**
   * Runs a job.
   *
   * Calls containers in order and passes output of previous container as input to
   * next container. If any container fails, the job is marked as failed. If all
   * containers succeed, the job is marked as successful. Stores job status and
   * results.
   */
  async #run_job(
    job_id: any,
    job_input: JobInput,
    containers: string[],
    message?: OffchainJobMessage,
    requires_proof?: boolean
  ): Promise<ContainerResult[]> {
    await this.#store.set_running(message);

    const results: ContainerResult[] = [];

    // If only one container, destination of first container is destination of job
    // Otherwise, destination of first container is off-chain, and source of next
    // container is off-chain (i.e. chaining containers together)
    let inputData: ContainerInput = {
      source: job_input.source,
      destination:
        containers.length === 1 ? job_input.destination : JobLocation.OFFCHAIN,
      data: job_input.data,
      requires_proof: !!requires_proof,
    };

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

        results.push({ container, output } as ContainerOutput);

        this.#store.track_container_status(container, 'success');

        // If next container is the last container, set destination to
        // job destination. Otherwise, set destination to off-chain
        // (i.e. chaining containers together)
        inputData = {
          source: JobLocation.OFFCHAIN,
          destination:
            i === containers.length - 2
              ? job_input.destination
              : JobLocation.OFFCHAIN,
          data: output,
          requires_proof: !!requires_proof,
        };
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

        results.push(containerError as ContainerError);

        console.error('Container error', {
          id: job_id,
          ...containerError,
        });

        await this.#store.set_failed(message, results);

        this.#store.track_container_status(container, 'failed');

        return results;
      }
    }

    await this.#store.set_success(message, results);

    return results;
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
