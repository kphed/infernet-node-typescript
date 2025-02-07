// Reference: https://github.com/ritual-net/infernet-node/blob/073594fc5edafc9e78b8286b943565bd6d5b25c5/src/shared/config.py.
import fs from 'fs';

export class ConfigRateLimit {
  constructor(public num_requests: number = 60, public period: number = 60) {}
}

export class ConfigServer {
  constructor(
    public port: number = 4000,
    public rate_limit: ConfigRateLimit = new ConfigRateLimit()
  ) {}
}

export class ConfigWallet {
  constructor(
    public max_gas_limit: number = 5_000_000,
    public private_key?: string,
    public payment_address?: string,
    public allowed_sim_errors: string[] = []
  ) {}
}

export class ConfigSnapshotSync {
  constructor(
    public sleep: number = 1,
    public batch_size: number = 500,
    public starting_sub_id: number = 0,
    public sync_period: number = 0.5
  ) {}
}

export class ConfigChain {
  constructor(
    public enabled: boolean = false,
    public rpc_url?: string,
    public trail_head_blocks: number = 1,
    public registry_address?: string,
    public wallet?: ConfigWallet,
    public snapshot_sync: ConfigSnapshotSync = new ConfigSnapshotSync()
  ) {}
}

export class ConfigDocker {
  constructor(public username: string, public password: string) {}
}

export class InfernetContainer {
  constructor(
    public id: string,
    public image: string = '',
    public url: string = '',
    public bearer: string = '',
    public port: number = 3000,
    public external: boolean = true,
    public gpu: boolean = false,
    public accepted_payments: {
      [key: string]: number;
    } = {},
    public allowed_ips: string[] = [],
    public allowed_addresses: string[] = [],
    public allowed_delegate_addresses: string[] = [],
    public description: string = '',
    public command: string = '',
    public env: {
      [key: string]: any;
    } = {},
    public generates_proofs: boolean = false,
    public volumes: string[] = []
  ) {}
}

export class ConfigRedis {
  constructor(public host: string = 'redis', public port: number = 6379) {}
}

export class ConfigLog {
  constructor(
    public path: string = 'infernet_node.log',
    public max_file_size: number = 2 ** 30,
    public backup_count: number = 2
  ) {}
}

export class Config {
  constructor(
    public containers: InfernetContainer[] = [],
    public chain: ConfigChain = new ConfigChain(),
    public docker?: ConfigDocker,
    public forward_stats: boolean = true,
    public log: ConfigLog = new ConfigLog(),
    public manage_containers: boolean = true,
    public redis: ConfigRedis = new ConfigRedis(),
    public server: ConfigServer = new ConfigServer(),
    public startup_wait: number = 5
  ) {
    if (chain.enabled) {
      if (!chain.rpc_url)
        throw new Error('rpc_url must be defined when chain is enabled');

      if (!chain.registry_address)
        throw new Error(
          'registry_address must be defined when chain is enabled'
        );

      if (!chain.wallet)
        throw new Error('wallet must be defined when chain is enabled');

      if (!chain.wallet.private_key)
        throw new Error('private_key must be defined when chain is enabled');
    }

    if (manage_containers) {
      containers.forEach((container) => {
        if (!container.image)
          throw new Error(
            'image must be defined when manage_containers is set to true'
          );

        if (container.url) {
          console.warn(
            "containers.url is set in config but it won't be used since manage_containers is set to true"
          );
        }

        if (container.bearer) {
          console.warn(
            "containers.bearer is set in config but it won't be used since manage_containers is set to true"
          );
        }
      });
    }
  }
}

export const loadValidatedConfig = async (
  path = 'config.json'
): Promise<Config> => {
  const {
    containers,
    chain,
    docker,
    forward_stats,
    log,
    manage_containers,
    redis,
    server,
    startup_wait,
  } = JSON.parse(await fs.readFileSync(path, 'utf8'));

  return new Config(
    containers,
    chain,
    docker,
    forward_stats,
    log,
    manage_containers,
    redis,
    server,
    startup_wait
  );
};
