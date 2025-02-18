// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { Config, loadValidatedConfig, ConfigWallet } from './shared/config';
import { checkNodeIsUpToDate } from './version';
import { assignPorts } from './utils/container';
import { add0x } from './utils/helpers';
import {
  ContainerManager,
  DataStore,
  Orchestrator,
  Guardian,
} from './orchestration';
import {
  ContainerLookup,
  ChainProcessor,
  Wallet,
  RPC,
  Registry,
  WalletChecker,
  Coordinator,
  Reader,
  PaymentWallet,
  ChainListener,
} from './chain';
import { AsyncTask } from './shared/service';

const configPath = process.env.INFERNET_CONFIG_PATH ?? 'config.json';

class NodeLifecycle {
  #tasks: AsyncTask[] = [];

  async initialize() {
    let config: Config;

    try {
      config = await loadValidatedConfig(configPath);

      await checkNodeIsUpToDate();

      const chainEnabled = config.chain.enabled;
      config.containers = assignPorts(config.containers);
      const manager = new ContainerManager(
        config.containers,
        config.docker,
        config.startup_wait,
        config.manage_containers
      );

      this.#tasks.push(manager);

      await manager.setup();

      const store = new DataStore(config.redis.host, config.redis.port);

      await store.setup_redis_clients();

      const orchestrator = new Orchestrator(manager, store);
      const containerLookup = new ContainerLookup(config.containers);

      // Initialize chain-specific tasks.
      let processor: ChainProcessor;
      let wallet: Wallet;
      let guardian: Guardian;
      let chainId: number;

      if (chainEnabled) {
        const walletConfig = config.chain.wallet as ConfigWallet;
        const rpcUrl = config.chain.rpc_url as string;
        const registryAddress = config.chain.registry_address as string;
        const privateKey = add0x(walletConfig.private_key as string);
        const rpc = new RPC(rpcUrl, privateKey);
        chainId = await rpc.get_chain_id();
        const registry = new Registry(
          rpc,
          RPC.get_checksum_address(registryAddress)
        );
        const paymentAddress = walletConfig.payment_address
          ? RPC.get_checksum_address(walletConfig.payment_address)
          : undefined;
        const walletChecker = new WalletChecker(
          rpc,
          registry,
          config.containers,
          paymentAddress
        );
        guardian = new Guardian(
          config.containers,
          chainEnabled,
          containerLookup,
          walletChecker
        );

        await registry.populate_addresses();

        const coordinator = new Coordinator(
          rpc,
          registry.coordinator(),
          containerLookup
        );
        const reader = new Reader(rpc, registry.reader(), containerLookup);
        wallet = new Wallet(
          rpc,
          coordinator,
          privateKey,
          BigInt(walletConfig.max_gas_limit),
          paymentAddress,
          walletConfig.allowed_sim_errors
        );
        const paymentWallet = new PaymentWallet(paymentAddress, rpc);
        processor = new ChainProcessor(
          rpc,
          coordinator,
          wallet,
          paymentWallet,
          walletChecker,
          registry,
          orchestrator,
          containerLookup
        );
        const listener = new ChainListener(
          rpc,
          coordinator,
          registry,
          reader,
          guardian,
          processor,
          config.chain.trail_head_blocks,
          config.chain.snapshot_sync
        );

        this.#tasks = this.#tasks.concat([processor, listener]);
      } else {
        guardian = new Guardian(
          config.containers,
          chainEnabled,
          containerLookup
        );
      }
    } catch (err) {
      throw `Config file validation failed: ${err}`;
    }
  }
}

(async () => {
  const nodeLifecycle = new NodeLifecycle();

  await nodeLifecycle.initialize();
})();
