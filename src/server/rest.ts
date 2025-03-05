// Reference: https://github.com/ritual-net/infernet-node/blob/a3a4627f990796dad29ee8444ebf1aa1a5bc2726/src/server/rest.py.
import { z } from 'zod';
import fastify, { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { Guardian } from '../orchestration/guardian';
import { ContainerManager } from '../orchestration/docker';
import { Orchestrator } from '../orchestration/orchestrator';
import { ChainProcessor } from '../chain/processor';
import { DataStore } from '../orchestration/store';
import { AsyncTask } from '../shared/service';
import { AddressSchema } from '../shared/schemas';
import {
  MessageType,
  OffchainJobMessage,
  OffchainJobMessageSchema,
  OffchainMessage,
  OffchainMessageSchema,
  BaseMessage,
} from '../shared/message';
import { GuardianError } from '../shared/message';
import { Readable } from 'stream';
import { SerializedSubscription } from '../shared/subscription';

const trustedIPs = ['127.0.0.1'];

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
    run_forever: z.function().returns(z.void()),
    stop: z.function().returns(z.promise(z.void())),
    cleanup: z.function().returns(z.void()),
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

    const hostname = '0.0.0.0';

    console.info('Serving REST webserver', {
      addr: hostname,
      port: this.#port,
    });

    await this.#app.listen({
      host: hostname,
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

        if (!ip)
          return response
            .code(400)
            .send({ error: 'Could not get client IP address' });

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

    // Creates off-chain jobs in batch (direct compute requests / subscriptions).
    this.#app.post('/api/jobs/batch', async (request, response) => {
      const { body: data, ip, url, method } = request;

      if (!ip)
        return response
          .code(400)
          .send({ error: 'Could not get client IP address' });

      console.debug('Received new off-chain raw message batch', { msg: data });

      if (!Array.isArray(data))
        return response.code(400).send({ error: 'Expected a list' });

      try {
        const parsedAndFiltered: (OffchainMessage | GuardianError)[] = [];

        for (let i = 0; i < data.length; i++) {
          const parsed = {
            id: uuidv4(),
            ip,
            ...data[i],
          };

          if (parsed.type === MessageType.DelegatedSubscription) {
            parsed.subscription = new SerializedSubscription(
              parsed.subscription.owner,
              parsed.subscription.active_at,
              parsed.subscription.period,
              parsed.subscription.frequency,
              parsed.subscription.redundancy,
              parsed.subscription.containers,
              parsed.subscription.lazy,
              parsed.subscription.verifier,
              parsed.subscription.payment_amount,
              parsed.subscription.payment_token,
              parsed.subscription.wallet
            );
            parsed.signature = {
              ...parsed.signature,
              v: BigInt(parsed.signature.v),
              // The `r` and `s` signature params must be passed as strings in the request body
              // to avoid precision loss when casting to bigint.
              r: BigInt(parsed.signature.r),
              s: BigInt(parsed.signature.s),
            };
          }

          const { success: isOffchainMessage } =
            OffchainMessageSchema.safeParse(parsed);

          // Filter out non-offchain messages.
          if (!isOffchainMessage) continue;

          parsedAndFiltered.push(await this.#guardian.process_message(parsed));
        }

        const results = parsedAndFiltered.map((msg) => {
          if (msg instanceof GuardianError)
            return {
              error: msg.error,
              params: msg.params,
            };

          const { success: isOffchainMessage } =
            OffchainMessageSchema.safeParse(msg);

          if (isOffchainMessage) {
            if (msg.type === MessageType.OffchainJob) {
              this.#orchestrator.process_offchain_job(
                msg as OffchainJobMessage
              );

              return {
                id: msg.id,
              };
            } else if (msg.type === MessageType.DelegatedSubscription) {
              if (!this.#processor) throw new Error('Chain not enabled');

              this.#processor.track(msg);

              return {};
            } else {
              return { error: 'Could not parse message' };
            }
          }
        });

        console.debug('Processed REST response', {
          endpoint: url,
          method,
          status: 200,
          results,
        });

        return response.code(200).send(results);
      } catch (err) {
        console.error('Processed REST response', {
          endpoint: url,
          method,
          status: 500,
          err: `${err}`,
        });

        return response
          .code(500)
          .send({ error: `Could not enqueue job: ${err}` });
      }
    });

    // Get tracked jobs.
    this.#app.get('/api/jobs', async (request, response) => {
      const { query, ip } = request as {
        query: {
          id: string | undefined;
          pending: string | undefined;
          intermediate: string | undefined;
        };
        ip: string;
      };
      const id = query.id ? query.id.split(',') : [];
      const pending =
        query.pending === undefined ? undefined : query.pending === 'true';
      const intermediate = query.intermediate === 'true';

      if (!ip)
        return response
          .code(400)
          .send({ error: 'Could not get client IP address' });

      if (!id.length) {
        // If `pending` is undefined, will fetch all job IDs.
        response.code(200).send(await this.#store.get_job_ids(ip, pending));
      } else {
        response.code(200).send(
          await this.#store.get(
            id.map(
              (id) =>
                ({
                  id,
                  ip,
                } as BaseMessage)
            ),
            intermediate
          )
        );
      }
    });

    // Stores job status in data store
    this.#app.put('/api/status', async (request, response) => {
      const { ip, body, url, method }: any = request;

      if (!ip)
        return response
          .code(400)
          .send({ error: 'Could not get client IP address' });

      if (!trustedIPs.includes(ip)) {
        console.warn('Unauthorized attempt to store job status', {
          remote_addr: ip,
        });

        return response.code(403).send({ error: 'Unauthorized' });
      }

      try {
        console.debug('Received new result', { result: body });

        const parsed: OffchainMessage = OffchainMessageSchema.parse({
          id: body.id,
          ip,
          containers: body.containers,
          data: {},
        });

        switch (body.status) {
          case 'success':
            await this.#store.set_success(parsed, []);
            await Promise.all(
              body.containers.map(async (container) => {
                await this.#store.track_container_status(container, 'success');
              })
            );

            break;
          case 'failed':
            await this.#store.set_failed(parsed, []);
            await Promise.all(
              body.containers.map(async (container) => {
                await this.#store.track_container_status(container, 'failed');
              })
            );

            break;
          case 'running':
            await this.#store.set_running(parsed);

            break;
          default:
            return response.code(400).send({ error: 'Status is invalid' });
        }

        return response.code(200).send({});
      } catch (err) {
        console.error('Processed REST response', {
          endpoint: url,
          method,
          status: 500,
          err,
        });

        response.code(500).send({ error: 'Could not store job status' });
      }
    });
  });

  // Stops the REST server.
  stop = RESTServer.methodSchemas.stop.implement(async () => {
    console.info('Stopping REST webserver');

    this.#abort_signal_controller.abort();
  });

  run_forever = RESTServer.methodSchemas.run_forever.implement(() => {});

  cleanup = RESTServer.methodSchemas.cleanup.implement(() => {});
}
