// Reference: https://github.com/ritual-net/infernet-node/blob/e07f9ca13bdaeb376f02d31b1d2c63e1fd373621/src/main.py.
import * as dotenv from 'dotenv';

dotenv.config();

import { loadValidatedConfig } from './shared/config';
import { checkNodeIsUpToDate } from './version';

const configPath = process.env.INFERNET_CONFIG_PATH ?? 'config.json';

export default async () => {
  let config;

  try {
    config = await loadValidatedConfig(configPath);

    await checkNodeIsUpToDate();
  } catch (err) {
    throw `Config file validation failed: ${err}`;
  }
};
