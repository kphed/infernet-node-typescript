// Reference: https://github.com/ritual-net/infernet-node/blob/cf254b9c9601883bd3a716b41028f686cd04b163/src/shared/message.py.
import { z } from 'zod';
import { CoordinatorSignatureParamsSchema } from '../chain/coordinator';
import { SerializedSubscription, Subscription } from './subscription';

export enum MessageType {
  OffchainJob = 0,
  DelegatedSubscription = 1,
  SubscriptionCreated = 2,
}

export const MessageTypeSchema = z.nativeEnum(MessageType);

export const BaseMessageSchema = z
  .object({
    id: z.string(),
    ip: z.string(),
  })
  .strict();

export const OffchainJobMessageSchema = BaseMessageSchema.extend({
  containers: z.string().array(),
  data: z.object({}).catchall(z.any()),
  type: z.literal(MessageType.OffchainJob),
  requires_proof: z.boolean().optional().default(false),
}).strict();

export const DelegatedSubscriptionMessageSchema = BaseMessageSchema.extend({
  subscription: z.instanceof(SerializedSubscription),
  signature: CoordinatorSignatureParamsSchema,
  data: z.object({}).catchall(z.any()),
  type: z.literal(MessageType.DelegatedSubscription),
  requires_proof: z.boolean().optional().default(false),
}).strict();

export const SubscriptionCreatedMessageSchema = z
  .object({
    subscription: z.instanceof(Subscription),
    type: z.literal(MessageType.SubscriptionCreated),
    requires_proof: z.boolean().optional().default(false),
  })
  .strict();

export const OffchainMessageSchema = z.union([
  OffchainJobMessageSchema,
  DelegatedSubscriptionMessageSchema,
]);

export const CoordinatorMessageSchema = SubscriptionCreatedMessageSchema;

export const FilteredMessageSchema = z.union([
  OffchainMessageSchema,
  CoordinatorMessageSchema,
]);

export const PrefilterMessageSchema = z.union([
  OffchainMessageSchema,
  CoordinatorMessageSchema,
]);

export const OnchainMessageSchema = z.union([
  CoordinatorMessageSchema,
  DelegatedSubscriptionMessageSchema,
]);

export type BaseMessage = z.infer<typeof BaseMessageSchema>;

export type OffchainJobMessage = z.infer<typeof OffchainJobMessageSchema>;

export type DelegatedSubscriptionMessage = z.infer<
  typeof DelegatedSubscriptionMessageSchema
>;

export type SubscriptionCreatedMessage = z.infer<
  typeof SubscriptionCreatedMessageSchema
>;

export type OffchainMessage = z.infer<typeof OffchainMessageSchema>;

export type CoordinatorMessage = z.infer<typeof CoordinatorMessageSchema>;

export type FilteredMessage = z.infer<typeof FilteredMessageSchema>;

export type PrefilterMessage = z.infer<typeof PrefilterMessageSchema>;

export type OnchainMessage = z.infer<typeof OnchainMessageSchema>;

export class GuardianError {
  static fieldSchemas = {
    message: PrefilterMessageSchema,
    error: z.string(),
    params: z.record(z.any()).default({}),
  };

  message: z.infer<typeof GuardianError.fieldSchemas.message>;
  error: z.infer<typeof GuardianError.fieldSchemas.error>;
  params: z.infer<typeof GuardianError.fieldSchemas.params>;

  constructor(_message, _error, _params) {
    this.message = GuardianError.fieldSchemas.message.parse(_message);
    this.error = GuardianError.fieldSchemas.error.parse(_error);
    this.params = GuardianError.fieldSchemas.params.parse(_params);
  }
}
