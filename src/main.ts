// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { z } from 'zod';
import {
  ConfigSchema,
  loadValidatedConfig,
  ConfigWallet,
} from './shared/config';
import { checkNodeIsUpToDate } from './version';
import { assignPorts } from './utils/container';
import { add0x } from './utils/helpers';
import { ContainerManager } from './orchestration/docker';
import { DataStore } from './orchestration/store';
import { Orchestrator } from './orchestration/orchestrator';
import { Guardian } from './orchestration/guardian';
import { ContainerLookup } from './chain/containerLookup';
import { ChainProcessor } from './chain/processor';
import { Wallet } from './chain/wallet';
import { RPC } from './chain/rpc';
import { Registry } from './chain/registry';
import { WalletChecker } from './chain/walletChecker';
import { Coordinator } from './chain/coordinator';
import { Reader } from './chain/reader';
import { PaymentWallet } from './chain/paymentWallet';
import { ChainListener } from './chain/listener';
import { AsyncTask } from './shared/service';

export class NodeLifecycle {
  static fieldSchemas = {
    _configPath: z.string(),
    _tasks: z.instanceof(AsyncTask).array(),
    config: ConfigSchema,
    manager: z.instanceof(ContainerManager),
    store: z.instanceof(DataStore),
    orchestrator: z.instanceof(Orchestrator),
    containerLookup: z.instanceof(ContainerLookup),
    processor: z.instanceof(ChainProcessor),
    wallet: z.instanceof(Wallet),
    guardian: z.instanceof(Guardian),
    rpc: z.instanceof(RPC),
    registry: z.instanceof(Registry),
    walletChecker: z.instanceof(WalletChecker),
    coordinator: z.instanceof(Coordinator),
    reader: z.instanceof(Reader),
    paymentWallet: z.instanceof(PaymentWallet),
    listener: z.instanceof(ChainListener),
  };

  #configPath: z.infer<typeof NodeLifecycle.fieldSchemas._configPath>;
  #tasks: z.infer<typeof NodeLifecycle.fieldSchemas._tasks> = [];
  config!: z.infer<typeof NodeLifecycle.fieldSchemas.config>;
  manager!: z.infer<typeof NodeLifecycle.fieldSchemas.manager>;
  store!: z.infer<typeof NodeLifecycle.fieldSchemas.store>;
  orchestrator!: z.infer<typeof NodeLifecycle.fieldSchemas.orchestrator>;
  containerLookup!: z.infer<typeof NodeLifecycle.fieldSchemas.containerLookup>;
  processor!: z.infer<typeof NodeLifecycle.fieldSchemas.processor>;
  wallet!: z.infer<typeof NodeLifecycle.fieldSchemas.wallet>;
  guardian!: z.infer<typeof NodeLifecycle.fieldSchemas.guardian>;
  rpc!: z.infer<typeof NodeLifecycle.fieldSchemas.rpc>;
  registry!: z.infer<typeof NodeLifecycle.fieldSchemas.registry>;
  walletChecker!: z.infer<typeof NodeLifecycle.fieldSchemas.walletChecker>;
  coordinator!: z.infer<typeof NodeLifecycle.fieldSchemas.coordinator>;
  reader!: z.infer<typeof NodeLifecycle.fieldSchemas.reader>;
  paymentWallet!: z.infer<typeof NodeLifecycle.fieldSchemas.paymentWallet>;
  listener!: z.infer<typeof NodeLifecycle.fieldSchemas.listener>;

  constructor(configPath = process.env.INFERNET_CONFIG_PATH) {
    this.#configPath = NodeLifecycle.fieldSchemas._configPath.parse(
      configPath ?? 'config.json'
    );
  }

  async on_startup() {
    try {
      this.config = NodeLifecycle.fieldSchemas.config.parse(
        await loadValidatedConfig(this.#configPath)
      );

      await checkNodeIsUpToDate();

      const chainEnabled = this.config.chain.enabled;

      console.debug('Running startup', { chain_enabled: chainEnabled });

      const containerConfigs = assignPorts(this.config.containers);
      this.manager = new ContainerManager(
        containerConfigs,
        this.config.docker,
        this.config.startup_wait,
        this.config.manage_containers
      );

      this.#tasks.push(this.manager);

      await this.manager.setup(false);

      this.store = new DataStore(
        this.config.redis.host,
        this.config.redis.port
      );

      await this.store.setup();

      this.orchestrator = new Orchestrator(this.manager, this.store);
      this.containerLookup = new ContainerLookup(containerConfigs);

      if (chainEnabled) {
        const walletConfig = this.config.chain.wallet as ConfigWallet;
        const rpcUrl = this.config.chain.rpc_url as string;
        const registryAddress = this.config.chain.registry_address as string;
        const privateKey = add0x(walletConfig.private_key as string);
        this.rpc = new RPC(rpcUrl, privateKey);
        const chainId = await this.rpc.get_chain_id();
        this.registry = new Registry(
          this.rpc,
          RPC.get_checksum_address(registryAddress)
        );
        const paymentAddress = walletConfig.payment_address
          ? RPC.get_checksum_address(walletConfig.payment_address)
          : undefined;
        this.walletChecker = new WalletChecker(
          this.rpc,
          this.registry,
          containerConfigs,
          paymentAddress
        );
        this.guardian = new Guardian(
          containerConfigs,
          chainEnabled,
          this.containerLookup,
          this.walletChecker
        );

        await this.registry.populate_addresses();

        this.coordinator = new Coordinator(
          this.rpc,
          this.registry.coordinator,
          this.containerLookup
        );
        this.reader = new Reader(
          this.rpc,
          this.registry.reader,
          this.containerLookup
        );
        this.wallet = new Wallet(
          this.rpc,
          this.coordinator,
          privateKey,
          BigInt(walletConfig.max_gas_limit),
          paymentAddress,
          walletConfig.allowed_sim_errors
        );
        this.paymentWallet = new PaymentWallet(paymentAddress, this.rpc);
        this.processor = new ChainProcessor(
          this.rpc,
          this.coordinator,
          this.wallet,
          this.paymentWallet,
          this.walletChecker,
          this.registry,
          this.orchestrator,
          this.containerLookup
        );
        this.listener = new ChainListener(
          this.rpc,
          this.coordinator,
          this.registry,
          this.reader,
          this.guardian,
          this.processor,
          this.config.chain.trail_head_blocks,
          this.config.chain.snapshot_sync
        );

        this.#tasks = this.#tasks.concat([this.processor, this.listener]);
      } else {
        this.guardian = new Guardian(
          containerConfigs,
          chainEnabled,
          this.containerLookup
        );
      }
    } catch (err) {
      throw err;
    }
  }
}

(async () => {
  const nodeLifecycle = new NodeLifecycle();

  try {
    await nodeLifecycle.on_startup();
  } catch (err) {
    console.warn(err);
  }
})();
