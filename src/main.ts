// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { Config, loadValidatedConfig, ConfigWallet } from './shared/config';
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

const configPath = process.env.INFERNET_CONFIG_PATH ?? 'config.json';

class NodeLifecycle {
  #tasks: AsyncTask[] = [];

  async on_startup() {
    try {
      const config: Config = await loadValidatedConfig(configPath);

      await checkNodeIsUpToDate();

      const chainEnabled = config.chain.enabled;

      console.debug('Running startup', { chain_enabled: chainEnabled });

      const containerConfigs = assignPorts(config.containers);
      const manager = new ContainerManager(
        containerConfigs,
        config.docker,
        config.startup_wait,
        config.manage_containers
      );

      this.#tasks.push(manager);

      await manager.setup(false);

      const store = new DataStore(config.redis.host, config.redis.port);

      await store.setup();

      const orchestrator = new Orchestrator(manager, store);
      const containerLookup = new ContainerLookup(containerConfigs);

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
          containerConfigs,
          paymentAddress
        );
        guardian = new Guardian(
          containerConfigs,
          chainEnabled,
          containerLookup,
          walletChecker
        );

        await registry.populate_addresses();

        const coordinator = new Coordinator(
          rpc,
          registry.coordinator,
          containerLookup
        );
        const reader = new Reader(rpc, registry.reader, containerLookup);
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
          containerConfigs,
          chainEnabled,
          containerLookup
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
