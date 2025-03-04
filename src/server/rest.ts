// Reference: https://github.com/ritual-net/infernet-node/blob/a3a4627f990796dad29ee8444ebf1aa1a5bc2726/src/server/rest.py.
import { z } from 'zod';
import fastify, { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { Guardian } from '../orchestration/guardian';
import { ContainerManager } from '../orchestration/docker';
import { Orchestrator } from '../orchestration/orchestrator';
import { ChainProcessor } from '../chain/processor';
import { DataStore } from '../orchestration/store';
import { ConfigChainSchema, ConfigServerSchema } from '../shared/config';
import { AsyncTask } from '../shared/service';
import { AddressSchema } from '../shared/schemas';
import { MessageType, OffchainJobMessageSchema } from '../shared/message';
import { GuardianError } from '../shared/message';
import { Readable } from 'stream';

export class RESTServer extends AsyncTask {
  static fieldSchemas = {
    _guardian: z.instanceof(Guardian),
    _manager: z.instanceof(ContainerManager),
    _orchestrator: z.instanceof(Orchestrator),
    _processor: z.instanceof(ChainProcessor).optional(),
    _store: z.instanceof(DataStore),
    _chain: z.boolean(),
    _port: z.number(),
    _rate_limit: z
      .object({
        num_requests: z.number(),
        period: z.number(),
      })
      .strict(),
    _version: z.string(),
    _wallet_address: AddressSchema,
    _app: z.custom<FastifyInstance>(),
    _abort_signal_controller: z.custom<AbortController>(),
  };

  static methodSchemas = {
    setup: z.function().returns(z.promise(z.void())),
    register_routes: z.function().returns(z.void()),
  };

  #guardian: z.infer<typeof RESTServer.fieldSchemas._guardian>;
  #manager: z.infer<typeof RESTServer.fieldSchemas._manager>;
  #orchestrator: z.infer<typeof RESTServer.fieldSchemas._orchestrator>;
  #processor: z.infer<typeof RESTServer.fieldSchemas._processor>;
  #store: z.infer<typeof RESTServer.fieldSchemas._store>;
  #chain: z.infer<typeof RESTServer.fieldSchemas._chain>;
  #port: z.infer<typeof RESTServer.fieldSchemas._port>;
  #rate_limit: z.infer<typeof RESTServer.fieldSchemas._rate_limit>;
  #version: z.infer<typeof RESTServer.fieldSchemas._version>;
  #wallet_address: z.infer<typeof RESTServer.fieldSchemas._wallet_address>;
  #app: z.infer<typeof RESTServer.fieldSchemas._app>;
  #abort_signal_controller: z.infer<
    typeof RESTServer.fieldSchemas._abort_signal_controller
  >;

  constructor(
    guardian,
    manager,
    orchestrator,
    processor,
    store,
    config_chain,
    config_server,
    version,
    wallet_address
  ) {
    super();

    this.#guardian = RESTServer.fieldSchemas._guardian.parse(guardian);
    this.#manager = RESTServer.fieldSchemas._manager.parse(manager);
    this.#orchestrator =
      RESTServer.fieldSchemas._orchestrator.parse(orchestrator);
    this.#processor = RESTServer.fieldSchemas._processor.parse(processor);
    this.#store = RESTServer.fieldSchemas._store.parse(store);
    this.#chain = RESTServer.fieldSchemas._chain.parse(config_chain.enabled);
    this.#port = RESTServer.fieldSchemas._port.parse(config_server.port);
    this.#rate_limit = RESTServer.fieldSchemas._rate_limit.parse(
      config_server.rate_limit
    );
    this.#version = RESTServer.fieldSchemas._version.parse(version);
    this.#wallet_address =
      RESTServer.fieldSchemas._wallet_address.parse(wallet_address);
    this.#app = RESTServer.fieldSchemas._app.parse(
      fastify(
        process.env.NODE_ENV !== 'production'
          ? {
              // In production, we'll likely have to define a list of trusted proxy IPs to account for
              // malicious actors potentially spoofing the X-Forwarded-* header fields.
              trustProxy: true,
              logger: {
                level: 'warn',
              },
            }
          : {}
      )
    );
    this.#abort_signal_controller = new AbortController();

    console.debug('Initialized RESTServer', { port: this.#port });
  }

  // Set up the REST server.
  setup = RESTServer.methodSchemas.setup.implement(async () => {
    await this.#app.register(import('@fastify/rate-limit'), {
      max: this.#rate_limit.num_requests,
      timeWindow: this.#rate_limit.period,
    });

    this.register_routes();

    await this.#app.listen({
      host: '0.0.0.0',
      port: this.#port,
      signal: this.#abort_signal_controller.signal,
    });
  });

  register_routes = RESTServer.methodSchemas.register_routes.implement(() => {
    // Returns node health.
    this.#app.get('/health', (_, response) => {
      response.code(200).send({ status: 'healthy' });
    });

    // Returns running container information and pending job counts.
    this.#app.get('/info', async (_, response) => {
      return response.code(200).send({
        version: this.#version,
        containers: await this.#manager.running_container_info(),
        pending: await this.#store.get_pending_counters(),
        chain: {
          enabled: this.#chain,
          address: this.#wallet_address ?? '',
        },
      });
    });

    // Returns resources for a specific model ID (if provided), or full container resources.
    this.#app.get('/resources*', async (request, response) => {
      const { model_id } = request.params as { model_id: string };

      return response
        .code(200)
        .send(await this.#orchestrator.collect_service_resources(model_id));
    });

    // Filter and preprocess incoming off-chain messages.
    const filterCreateJob = (request, response, handler) => {
      try {
        const { body: data, ip, url, method } = request;

        if (!ip) {
          return response
            .code(400)
            .send({ error: 'Could not get client IP address' });
        }

        const jobId = uuidv4();

        console.debug('Received new off-chain raw message', {
          msg: data,
          job_id: jobId,
        });

        const parsed = OffchainJobMessageSchema.parse({
          ip,
          id: jobId,
          ...data,
        });
        const filtered = this.#guardian.process_message(parsed);

        if (filtered instanceof GuardianError) {
          const { error, params } = filtered;

          console.info('Error submitting job', {
            endpoint: url,
            method: method,
            status: 403,
            err: error,
            ...params,
          });

          return response.code(403).send({ error, params });
        }

        return handler(filtered);
      } catch (err) {
        console.error(`Error in endpoint preprocessing: ${err}`);

        return response
          .code(500)
          .send({ error: `Internal server error: ${err}` });
      }
    };

    // Creates new off-chain job (direct compute request or subscription).
    this.#app.post('/api/jobs', async (request, response) => {
      filterCreateJob(request, response, async (message) => {
        const { url, method } = request;
        const returnObj: { id?: string } = {};

        try {
          if (message.type === MessageType.OffchainJob) {
            await this.#orchestrator.process_offchain_job(message);

            returnObj.id = `${message.id}`;
          } else if (message.type === MessageType.DelegatedSubscription) {
            console.debug('Received delegated subscription request', {
              endpoint: url,
              method: method,
              status: 200,
              id: `${message.id}`,
            });

            if (!this.#processor) throw new Error('Chain not enabled');

            await this.#processor.track(message);
          }

          console.debug('Processed REST response', {
            endpoint: url,
            method: method,
            status: 200,
            type: message.type,
            id: `${message.id}`,
          });

          return response.code(200).send(returnObj);
        } catch (err) {
          console.error('Processed REST response', {
            endpoint: url,
            method: method,
            status: 500,
            err: `${err}`,
          });

          return response
            .code(500)
            .send({ error: `Could not enqueue job: ${err}` });
        }
      });
    });

    // Creates new off-chain streaming job (direct compute request only).
    this.#app.post('/api/jobs/stream', (request, response) => {
      filterCreateJob(request, response, (message) => {
        if (message.type !== MessageType.OffchainJob) {
          return response.code(405).send({
            error: 'Streaming only supported for OffchainJob requests.',
          });
        }

        console.debug('Processed REST response', {
          endpoint: request.url,
          method: request.method,
          status: 200,
          type: message.type,
          id: message.id,
        });

        // Prepends the message's ID to the streaming job results.
        async function* generator(streamingJob) {
          yield await Promise.resolve(`${message.id}\n`);

          for await (const chunk of streamingJob) {
            yield chunk;
          }
        }

        return response
          .code(200)
          .send(
            Readable.from(
              generator(this.#orchestrator.process_streaming_job(message))
            )
          );
      });
    });
  });

  run_forever = () => {};

  cleanup = () => {};
}
