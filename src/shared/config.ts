// Reference: https://github.com/ritual-net/infernet-node/blob/073594fc5edafc9e78b8286b943565bd6d5b25c5/src/shared/config.py.
import fs from 'fs';
import { z } from 'zod';
import { AddressSchema } from './schemas';

const ConfigRateLimitSchema = z
  .object({
    num_requests: z.number().default(60),
    period: z.number().default(60),
  })
  .strict();

const ConfigServerSchema = z
  .object({
    port: z.number().default(4000),
    rate_limit: ConfigRateLimitSchema.default(ConfigRateLimitSchema.parse({})),
  })
  .strict();

const ConfigWalletSchema = z
  .object({
    max_gas_limit: z.number().default(5000000),
    private_key: z.string().optional(),
    payment_address: AddressSchema.optional(),
    allowed_sim_errors: z.string().array().default([]),
  })
  .strict();

const ConfigSnapshotSyncSchema = z
  .object({
    sleep: z.number().default(1),
    batch_size: z.number().default(500),
    starting_sub_id: z.number().default(0),
    sync_period: z.number().default(0.5),
  })
  .strict();

const ConfigChainSchema = z
  .object({
    enabled: z.boolean().default(false),
    rpc_url: z.string().optional(),
    trail_head_blocks: z.number().default(1),
    registry_address: AddressSchema.optional(),
    wallet: ConfigWalletSchema.optional(),
    snapshot_sync: ConfigSnapshotSyncSchema.default(
      ConfigSnapshotSyncSchema.parse({})
    ),
  })
  .refine(({ enabled, rpc_url }) => (enabled ? !!rpc_url : true), {
    message: 'rpc_url must be defined when chain is enabled',
  })
  .refine(
    ({ enabled, registry_address }) => (enabled ? !!registry_address : true),
    {
      message: 'registry_address must be defined when chain is enabled',
    }
  )
  .refine(({ enabled, wallet }) => (enabled ? wallet : true), {
    message: 'wallet must be defined when chain is enabled',
  })
  .refine(({ enabled, wallet }) => (enabled ? wallet?.private_key : true), {
    message: 'private_key must be defined when chain is enabled',
  });

export const ConfigDockerSchema = z
  .object({
    username: z.string(),
    password: z.string(),
  })
  .strict();

export const InfernetContainerSchema = z
  .object({
    id: z.string(),
    image: z.string().default(''),
    url: z.string().default(''),
    bearer: z.string().default(''),
    port: z.number().default(3000),
    external: z.boolean().default(true),
    gpu: z.boolean().default(false),
    accepted_payments: z.object({}).catchall(z.number()).default({}),
    allowed_ips: z.string().array().default([]),
    allowed_addresses: z.string().array().default([]),
    allowed_delegate_addresses: z.string().array().default([]),
    description: z.string().default(''),
    command: z.string().default(''),
    env: z.object({}).catchall(z.string()).default({}),
    generates_proofs: z.boolean().default(false),
    volumes: z.string().array().default([]),
  })
  .strict();

const ConfigRedisSchema = z
  .object({
    host: z.string().default('redis'),
    port: z.number().default(6379),
  })
  .strict();

const ConfigLogSchema = z
  .object({
    path: z.string().default('infernet_node.log'),
    max_file_size: z.number().default(2 ** 30),
    backup_count: z.number().default(2),
  })
  .strict();

const ConfigSchema = z
  .object({
    containers: InfernetContainerSchema.array().default([]),
    chain: ConfigChainSchema,
    docker: ConfigDockerSchema.optional(),
    forward_stats: z.boolean().default(true),
    log: ConfigLogSchema.default(ConfigLogSchema.parse({})),
    manage_containers: z.boolean().default(true),
    redis: ConfigRedisSchema.default(ConfigRedisSchema.parse({})),
    server: ConfigServerSchema.default(ConfigServerSchema.parse({})),
    startup_wait: z.number().default(5),
  })
  .refine(
    ({ manage_containers, containers }) =>
      manage_containers
        ? containers.every((container) => !!container.image)
        : true,
    {
      message: 'Image must be defined when manage_containers is set to true',
    }
  );

export type ConfigRateLimit = z.infer<typeof ConfigRateLimitSchema>;

export type ConfigServer = z.infer<typeof ConfigServerSchema>;

export type ConfigWallet = z.infer<typeof ConfigWalletSchema>;

export type ConfigSnapshotSync = z.infer<typeof ConfigSnapshotSyncSchema>;

export type ConfigChain = z.infer<typeof ConfigChainSchema>;

export type ConfigDocker = z.infer<typeof ConfigDockerSchema>;

export type InfernetContainer = z.infer<typeof InfernetContainerSchema>;

export type ConfigRedis = z.infer<typeof ConfigRedisSchema>;

export type ConfigLog = z.infer<typeof ConfigLogSchema>;

export type Config = z.infer<typeof ConfigSchema>;

export const loadValidatedConfig = (
  path = 'config.json'
): z.infer<typeof ConfigSchema> => {
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
  } = JSON.parse(fs.readFileSync(path, 'utf8'));

  // `safeParse` returns an object containing either the successfully parsed data or a ZodError instance
  // containing detailed information about the validation problems instead of throwing an error.
  const { data, error } = ConfigSchema.safeParse({
    containers,
    chain,
    docker,
    forward_stats,
    log,
    manage_containers,
    redis,
    server,
    startup_wait,
  });

  if (!data) {
    console.error('Config file validation failed', { config_path: path });

    throw error;
  }

  if (data.manage_containers) {
    if (data.containers.find(({ url }) => !!url))
      console.warn(
        `containers.url is set in config but it won't be used since manage_containers is set to true`
      );

    if (data.containers.find(({ bearer }) => !!bearer))
      console.warn(
        `containers.bearer is set in config but it won't be used since manage_containers is set to true`
      );
  }

  return data;
};
