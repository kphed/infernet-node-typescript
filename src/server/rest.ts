// Reference: https://github.com/ritual-net/infernet-node/blob/a3a4627f990796dad29ee8444ebf1aa1a5bc2726/src/server/rest.py.
import { z } from 'zod';
import fastify, { FastifyInstance } from 'fastify';
import { Guardian } from '../orchestration/guardian';
import { ContainerManager } from '../orchestration/docker';
import { Orchestrator } from '../orchestration/orchestrator';
import { ChainProcessor } from '../chain/processor';
import { DataStore } from '../orchestration/store';
import { ConfigChainSchema, ConfigServerSchema } from '../shared/config';
import { AsyncTask } from '../shared/service';
import { AddressSchema } from '../shared/schemas';

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
  #app!: z.infer<typeof RESTServer.fieldSchemas._app>;
  #abort_signal_controller!: z.infer<
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

    console.debug('Initialized RESTServer', { port: this.#port });
  }

  // Set up the REST server.
  setup = RESTServer.methodSchemas.setup.implement(async () => {
    this.#app = RESTServer.fieldSchemas._app.parse(
      fastify({
        logger:
          process.env.NODE_ENV === 'production'
            ? false
            : {
                level: 'warn',
              },
      })
    );
    this.#abort_signal_controller = new AbortController();

    await this.#app.register(import('@fastify/rate-limit'), {
      max: this.#rate_limit.num_requests,
      timeWindow: this.#rate_limit.period,
    });

    await this.#app.listen({
      host: '0.0.0.0',
      port: this.#port,
      signal: this.#abort_signal_controller.signal,
    });
  });

  run_forever = () => {};

  cleanup = () => {};
}
