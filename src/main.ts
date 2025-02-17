// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { Config, loadValidatedConfig, ConfigWallet } from './shared/config';
import { checkNodeIsUpToDate } from './version';
import { assignPorts } from './utils/container';
import { add0x } from './utils/helpers';
import { ContainerManager, DataStore, Orchestrator } from './orchestration';
import {
  ContainerLookup,
  ChainProcessor,
  Wallet,
  RPC,
  Registry,
  WalletChecker,
} from './chain';

const configPath = process.env.INFERNET_CONFIG_PATH ?? 'config.json';

(async () => {
  let config: Config;

  try {
    config = await loadValidatedConfig(configPath);

    await checkNodeIsUpToDate();

    const chainEnabled = config.chain.enabled;
    config.containers = assignPorts(config.containers);
    const containerManager = new ContainerManager(
      config.containers,
      config.docker,
      config.startup_wait,
      config.manage_containers
    );

    await containerManager.setup();

    const store = new DataStore(config.redis.host, config.redis.port);

    await store.setup_redis_clients();

    const orchestrator = new Orchestrator(containerManager, store);
    const containerLookup = new ContainerLookup(config.containers);

    // Initialize chain-specific tasks.
    let process: ChainProcessor;
    let wallet: Wallet;
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
    }
  } catch (err) {
    throw `Config file validation failed: ${err}`;
  }
})();
