// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { Config, loadValidatedConfig } from './shared/config';
import { checkNodeIsUpToDate } from './version';
import { assignPorts } from './utils/container';
import { ContainerManager } from './orchestration/docker';
import { DataStore } from './orchestration/store';
import { Orchestrator } from './orchestration/orchestrator';
import { ContainerLookup } from './chain/containerLookup';

const configPath = process.env.INFERNET_CONFIG_PATH ?? 'config.json';

(async () => {
  let config: Config;

  try {
    config = await loadValidatedConfig(configPath);

    await checkNodeIsUpToDate();

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
  } catch (err) {
    throw `Config file validation failed: ${err}`;
  }
})();
