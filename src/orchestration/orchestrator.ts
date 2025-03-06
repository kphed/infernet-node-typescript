// Reference: https://github.com/ritual-net/infernet-node/blob/0a5c6cba32e48561338142ef6fabeba3a11057e4/src/orchestration/orchestrator.py.
import { z } from 'zod';
import {
  ContainerError,
  ContainerResult,
  ContainerInput,
  JobLocation,
  JobInputSchema,
  ContainerResultSchema,
  ContainerInputSchema,
  ContainerErrorSchema,
  ContainerOutputSchema,
} from '../shared/job';
import { OffchainJobMessageSchema } from '../shared/message';
import { ContainerManager } from './docker';
import { DataStore } from './store';

export class Orchestrator {
  static fieldSchemas = {
    _manager: z.instanceof(ContainerManager),
    _store: z.instanceof(DataStore),
    _host: z.string(),
  };

  static methodSchemas = {
    _get_container_url: z.function().args(z.string()).returns(z.string().url()),
    _get_headers: z
      .function()
      .args(z.string())
      .returns(
        z
          .object({
            'Content-Type': z.string(),
            Authorization: z.string().optional(),
          })
          .strict()
      ),
    _run_job: z
      .function()
      .args(
        z.any(),
        JobInputSchema,
        z.string().array(),
        OffchainJobMessageSchema.optional(),
        z.boolean().optional()
      )
      .returns(z.promise(ContainerResultSchema.array())),
    process_chain_processor_job: z
      .function()
      .args(z.any(), JobInputSchema, z.string().array(), z.boolean())
      .returns(z.promise(ContainerResultSchema.array())),
    process_offchain_job: z
      .function()
      .args(OffchainJobMessageSchema)
      .returns(z.promise(z.void())),
    process_streaming_job: {
      args: {
        message: OffchainJobMessageSchema,
      },
    },
    collect_service_resources: z
      .function()
      .args(z.string().optional())
      .returns(z.promise(z.record(z.any()))),
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
  #get_container_url = Orchestrator.methodSchemas._get_container_url.implement(
    (container) => {
      const container_url = this.#manager.get_url(container);
      let serviceOutputUrl;

      if (container_url) {
        serviceOutputUrl = `${container_url}/service_output`;
      } else {
        const port = this.#manager.get_port(container);
        serviceOutputUrl = `http://${this.#host}:${port}/service_output`;
      }

      return serviceOutputUrl;
    }
  );

  // Get the headers for the specified container, including bearer token if available.
  #get_headers = Orchestrator.methodSchemas._get_headers.implement(
    (container) => {
      const bearer = this.#manager.get_bearer(container);
      const headers: any = { 'Content-Type': 'application/json' };

      if (bearer) headers.Authorization = `Bearer ${bearer}`;

      return headers;
    }
  );

  // Runs a job by calling containers sequentially, piping their outputs into one another.
  #run_job = Orchestrator.methodSchemas._run_job.implement(
    async (job_id, job_input, containers, message, requires_proof) => {
      await this.#store.set_running(message);

      const results: ContainerResult[] = [];

      // If only one container, destination of first container is destination of job.
      // Otherwise, destination of first container is off-chain, and source of next
      // container is off-chain (i.e. chaining containers together).
      let inputData: ContainerInput = ContainerInputSchema.parse({
        source: job_input.source,
        destination:
          containers.length === 1
            ? job_input.destination
            : JobLocation.OFFCHAIN,
        data: job_input.data,
        requires_proof: !!requires_proof,
      });

      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const url = this.#get_container_url(container);
        const headers = this.#get_headers(container);
        const controller = new AbortController();

        // Abort request after 180 seconds.
        const timeout = setTimeout(() => controller.abort(), 180_000);

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

          return results;
        }
      }

      await this.#store.set_success(message, results);

      return results;
    }
  );

  // Processes arbitrary job from ChainProcessor.
  process_chain_processor_job =
    Orchestrator.methodSchemas.process_chain_processor_job.implement(
      (job_id, job_input, containers, requires_proof) =>
        this.#run_job(job_id, job_input, containers, undefined, requires_proof)
    );

  // Processes off-chain job message.
  process_offchain_job =
    Orchestrator.methodSchemas.process_offchain_job.implement(
      async (message) => {
        await this.#run_job(
          message.id,
          JobInputSchema.parse({
            source: JobLocation.OFFCHAIN,
            destination: JobLocation.OFFCHAIN,
            data: message.data,
          }),
          message.containers,
          message,
          message.requires_proof
        );
      }
    );

  // Runs a streaming job.
  async *process_streaming_job(
    message: z.infer<
      typeof Orchestrator.methodSchemas.process_streaming_job.args.message
    >
  ): AsyncGenerator<Buffer, void, unknown> {
    // Only the first container is supported for streaming (i.e. no chaining).
    const [container] = message.containers;

    const url = this.#get_container_url(container);
    const headers = this.#get_headers(container);

    await this.#store.set_running(
      Orchestrator.methodSchemas.process_streaming_job.args.message.parse(
        message
      )
    );

    try {
      const job_input = JobInputSchema.parse({
        source: JobLocation.OFFCHAIN,
        destination: JobLocation.STREAM,
        data: message.data,
      });
      const controller = new AbortController();

      // Abort request after 60 seconds.
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(job_input),
        signal: controller.signal,
      });

      if (response.status !== 200) throw new Error('Response status not OK.');
      if (!response.body) throw new Error('No response body.');

      const chunks: Buffer[] = [];

      try {
        for await (const chunk of response.body) {
          const bufferChunk = Buffer.from(chunk);

          chunks.push(bufferChunk);

          yield bufferChunk;
        }
      } finally {
        clearTimeout(timeout);
      }

      const output = Buffer.concat(chunks).toString('utf-8');

      await this.#store.set_success(message, [
        ContainerOutputSchema.parse({
          container,
          output: JSON.parse(output),
        }),
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
        ContainerErrorSchema.parse({
          container,
          error,
        }),
      ]);

      this.#store.track_container_status(container, 'failed');
    }
  }

  // Collects service resources from running containers.
  collect_service_resources =
    Orchestrator.methodSchemas.collect_service_resources.implement(
      async (model_id) => {
        const makeContainerUrl = (port: number): string => {
          const baseUrl = `http://${this.#host}:${port}/service-resources`;

          // If model ID specified, check which containers serve the model.
          // Otherwise, fetch all resources from each container.
          return model_id ? `${baseUrl}?model_id=${model_id}` : baseUrl;
        };

        const containerResources = await Promise.all(
          this.#manager.configs.map(async ({ id, port }) => {
            const url = makeContainerUrl(port);

            try {
              const response = await fetch(url);

              if (response.status !== 200)
                throw new Error('Response status not OK.');

              return [id, await response.json()];
            } catch (err) {
              console.error(`Error fetching data from ${url}: ${err}`);
            }
          })
        );

        return containerResources.reduce((acc, val) => {
          if (!val) return acc;

          const [id, data] = val;

          return {
            ...acc,
            [id]: data,
          };
        }, {});
      }
    );
}
