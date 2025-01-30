// Reference: https://github.com/ritual-net/infernet-node/blob/20365ab233119a106a9cb00912f5e97d4315687c/config.sample.json.
import fs from 'fs';

class ConfigRateLimit {
  num_requests: number = 60;
  period: number = 60;

  constructor(num_requests = this.num_requests, period = this.period) {
    this.num_requests = num_requests;
    this.period = period;
  }
}

class ConfigServer {
  port: number = 4000;
  rate_limit: ConfigRateLimit = new ConfigRateLimit();

  constructor(port = this.port, rate_limit = this.rate_limit) {
    this.port = port;
    this.rate_limit = rate_limit;
  }
}

class ConfigWallet {
  max_gas_limit: number = 5_000_000;
  private_key?: string;
  payment_address?: string;
  allowed_sim_errors: string[] = [];

  constructor(
    max_gas_limit = this.max_gas_limit,
    private_key = this.private_key,
    payment_address = this.payment_address,
    allowed_sim_errors = this.allowed_sim_errors
  ) {
    this.max_gas_limit = max_gas_limit;
    this.private_key = private_key;
    this.payment_address = payment_address;
    this.allowed_sim_errors = allowed_sim_errors;
  }
}

class ConfigSnapshotSync {
  sleep: number = 1;
  batch_size: number = 500;
  starting_sub_id: number = 0;
  sync_period: number = 0.5;

  constructor(
    sleep = this.sleep,
    batch_size = this.batch_size,
    starting_sub_id = this.starting_sub_id,
    sync_period = this.sync_period
  ) {
    this.sleep = sleep;
    this.batch_size = batch_size;
    this.starting_sub_id = starting_sub_id;
    this.sync_period = sync_period;
  }
}

class ConfigChain {
  enabled: boolean = false;
  rpc_url?: string;
  trail_head_blocks: number = 1;
  registry_address?: string;
  wallet?: ConfigWallet;
  snapshot_sync: ConfigSnapshotSync = new ConfigSnapshotSync();

  constructor(
    enabled = this.enabled,
    rpc_url = this.rpc_url,
    trail_head_blocks = this.trail_head_blocks,
    registry_address = this.registry_address,
    wallet = this.wallet,
    snapshot_sync = this.snapshot_sync
  ) {
    this.enabled = enabled;
    this.rpc_url = rpc_url;
    this.trail_head_blocks = trail_head_blocks;
    this.registry_address = registry_address;
    this.wallet = wallet;
    this.snapshot_sync = snapshot_sync;

    if (enabled) {
      if (!rpc_url)
        throw new Error('rpc_url must be defined when chain is enabled');

      if (!registry_address)
        throw new Error(
          'registry_address must be defined when chain is enabled'
        );

      if (!wallet)
        throw new Error('wallet must be defined when chain is enabled');

      if (!wallet.private_key)
        throw new Error('private_key must be defined when chain is enabled');
    }
  }
}

class ConfigDocker {
  username: string;
  password: string;

  constructor(username, password) {
    this.username = username;
    this.password = password;
  }
}

class InfernetContainer {
  id: string;
  image: string = '';
  url: string = '';
  bearer: string = '';
  port: number = 3000;
  external: boolean = true;
  gpu: boolean = false;
  accepted_payments: {
    [key: string]: number;
  } = {};
  allowed_ips: string[] = [];
  allowed_addresses: string[] = [];
  allowed_delegate_addresses: string[] = [];
  description: string = '';
  command: string = '';
  env: {
    [key: string]: any;
  } = {};
  generates_proofs: boolean = false;
  volumes: string[] = [];

  constructor(
    id,
    image?,
    url?,
    bearer?,
    port?,
    external?,
    gpu?,
    accepted_payments?,
    allowed_ips?,
    allowed_addresses?,
    allowed_delegate_addresses?,
    description?,
    command?,
    env?,
    generates_proofs?,
    volumes?
  ) {
    this.id = id;
    this.image = image;
    this.url = url;
    this.bearer = bearer;
    this.port = port;
    this.external = external;
    this.gpu = gpu;
    this.accepted_payments = accepted_payments;
    this.allowed_ips = allowed_ips;
    this.allowed_addresses = allowed_addresses;
    this.allowed_delegate_addresses = allowed_delegate_addresses;
    this.description = description;
    this.command = command;
    this.env = env;
    this.generates_proofs = generates_proofs;
    this.volumes = volumes;
  }
}

class ConfigRedis {
  host: string = 'redis';
  port: number = 6379;

  constructor(host = this.host, port = this.port) {
    this.host = host;
    this.port = port;
  }
}

class ConfigLog {
  path: string = 'infernet_node.log';
  max_file_size: number = 2 ** 30;
  backup_count: number = 2;

  constructor(
    path = this.path,
    max_file_size = this.max_file_size,
    backup_count = this.backup_count
  ) {
    this.path = path;
    this.max_file_size = max_file_size;
    this.backup_count = backup_count;
  }
}

class Config {
  containers: InfernetContainer[] = [];
  chain: ConfigChain = new ConfigChain();
  docker?: ConfigDocker;
  forward_stats: boolean = true;
  log: ConfigLog = new ConfigLog();
  manage_containers: boolean = true;
  redis: ConfigRedis = new ConfigRedis();
  server: ConfigServer = new ConfigServer();
  startup_wait: number = 5;

  constructor(
    containers = this.containers,
    chain?: ConfigChain,
    docker = this.docker,
    forward_stats = this.forward_stats,
    log = this.log,
    manage_containers = this.manage_containers,
    redis = this.redis,
    server = this.server,
    startup_wait = this.startup_wait
  ) {
    this.containers = containers;
    this.chain = chain
      ? new ConfigChain(
          chain.enabled,
          chain.rpc_url,
          chain.trail_head_blocks,
          chain.registry_address,
          chain.wallet,
          chain.snapshot_sync
        )
      : this.chain;
    this.docker = docker;
    this.forward_stats = forward_stats;
    this.log = log;
    this.manage_containers = manage_containers;
    this.redis = redis;
    this.server = server;
    this.startup_wait = startup_wait;

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
