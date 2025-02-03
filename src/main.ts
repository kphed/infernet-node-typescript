// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { Config, loadValidatedConfig } from './shared/config';
import { checkNodeIsUpToDate } from './version';
import { assignPorts } from './utils/container';
import { ContainerManager } from './orchestration/docker';

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
  } catch (err) {
    throw `Config file validation failed: ${err}`;
  }
})();
