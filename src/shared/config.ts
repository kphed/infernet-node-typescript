// Reference: https://github.com/ritual-net/infernet-node/blob/073594fc5edafc9e78b8286b943565bd6d5b25c5/src/shared/config.py.
import fs from 'fs';
import { z } from 'zod';
import {
  NumberSchema,
  StringSchema,
  DefaultNumberSchema,
  DefaultStringSchema,
  DefaultBooleanSchema,
  AddressStringSchema,
  StrictObjectSchema,
} from './schemas';

const ConfigRateLimitSchema = StrictObjectSchema({
  num_requests: DefaultNumberSchema(60),
  period: DefaultNumberSchema(60),
});

const ConfigServerSchema = StrictObjectSchema({
  port: DefaultNumberSchema(4000),
  rate_limit: ConfigRateLimitSchema.default(ConfigRateLimitSchema.parse({})),
});

const ConfigWalletSchema = StrictObjectSchema({
  max_gas_limit: DefaultNumberSchema(5000000),
  private_key: StringSchema.optional(),
  payment_address: AddressStringSchema.optional(),
  allowed_sim_errors: StringSchema.array().default([]),
});

const ConfigSnapshotSyncSchema = StrictObjectSchema({
  sleep: DefaultNumberSchema(1),
  batch_size: DefaultNumberSchema(500),
  starting_sub_id: DefaultNumberSchema(0),
  sync_period: DefaultNumberSchema(0.5),
});

const ConfigChainSchema = z
  .object({
    enabled: z.boolean().default(false),
    rpc_url: StringSchema.optional(),
    trail_head_blocks: DefaultNumberSchema(1),
    registry_address: AddressStringSchema.optional(),
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

const ConfigDockerSchema = StrictObjectSchema({
  username: StringSchema,
  password: StringSchema,
});

const InfernetContainerSchema = StrictObjectSchema({
  id: StringSchema,
  image: DefaultStringSchema(''),
  url: DefaultStringSchema(''),
  bearer: DefaultStringSchema(''),
  port: DefaultNumberSchema(3000),
  external: DefaultBooleanSchema(true),
  gpu: DefaultBooleanSchema(false),
  accepted_payments: z.object({}).catchall(NumberSchema).default({}),
  allowed_ips: StringSchema.array().default([]),
  allowed_addresses: StringSchema.array().default([]),
  allowed_delegate_addresses: StringSchema.array().default([]),
  description: DefaultStringSchema(''),
  command: DefaultStringSchema(''),
  env: z.object({}).default({}),
  generates_proofs: DefaultBooleanSchema(false),
  volumes: StringSchema.array().default([]),
});

const ConfigRedisSchema = StrictObjectSchema({
  host: DefaultStringSchema('redis'),
  port: DefaultNumberSchema(6379),
});

const ConfigLogSchema = StrictObjectSchema({
  path: DefaultStringSchema('infernet_node.log'),
  max_file_size: DefaultNumberSchema(2 ** 30),
  backup_count: DefaultNumberSchema(2),
});

const ConfigSchema = z
  .object({
    containers: InfernetContainerSchema.array().default([]),
    chain: ConfigChainSchema,
    docker: ConfigDockerSchema.optional(),
    forward_stats: DefaultBooleanSchema(true),
    log: ConfigLogSchema.default(ConfigLogSchema.parse({})),
    manage_containers: DefaultBooleanSchema(true),
    redis: ConfigRedisSchema.default(ConfigRedisSchema.parse({})),
    server: ConfigServerSchema.default(ConfigServerSchema.parse({})),
    startup_wait: DefaultNumberSchema(5),
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

  const config = ConfigSchema.parse({
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

  if (config.manage_containers) {
    if (config.containers.find(({ url }) => !!url))
      console.warn(
        `containers.url is set in config but it won't be used since manage_containers is set to true`
      );

    if (config.containers.find(({ bearer }) => !!bearer))
      console.warn(
        `containers.bearer is set in config but it won't be used since manage_containers is set to true`
      );
  }

  return config;
};
