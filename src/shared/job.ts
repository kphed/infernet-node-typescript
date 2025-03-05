// Reference: https://github.com/ritual-net/infernet-node/blob/cf254b9c9601883bd3a716b41028f686cd04b163/src/shared/job.py.
import { z } from 'zod';

export enum JobLocation {
  ONCHAIN = 0,
  OFFCHAIN = 1,
  STREAM = 2,
}

export const JobLocationSchema = z.nativeEnum(JobLocation);

export const ContainerInputSchema = z
  .object({
    source: z.union([
      z.literal(JobLocation.ONCHAIN),
      z.literal(JobLocation.OFFCHAIN),
    ]),
    destination: JobLocationSchema,
    data: z.any(),
    requires_proof: z.boolean(),
  })
  .strict();

export const ContainerOutputSchema = z
  .object({
    container: z.string(),
    output: z.object({}).catchall(z.any()),
  })
  .strict();

export const ContainerErrorSchema = z
  .object({
    container: z.string(),
    error: z.string(),
  })
  .strict();

export const ContainerResultSchema = z.union([
  ContainerErrorSchema,
  ContainerOutputSchema,
]);

export const JobInputSchema = z
  .object({
    source: z.union([
      z.literal(JobLocation.ONCHAIN),
      z.literal(JobLocation.OFFCHAIN),
    ]),
    destination: JobLocationSchema,
    data: z.any(),
  })
  .strict();

export const JobStatusSchema = z.union([
  z.literal('running'),
  z.literal('success'),
  z.literal('failed'),
]);

export const JobResultSchema = z
  .object({
    id: z.string(),
    status: JobStatusSchema,
    intermediate_results: ContainerResultSchema.array().optional(),
    result: ContainerResultSchema.optional(),
  })
  .strict();

export type ContainerInput = z.infer<typeof ContainerInputSchema>;

export type ContainerOutput = z.infer<typeof ContainerOutputSchema>;

export type ContainerError = z.infer<typeof ContainerErrorSchema>;

export type ContainerResult = z.infer<typeof ContainerResultSchema>;

export type JobInput = z.infer<typeof JobInputSchema>;

export type JobStatus = z.infer<typeof JobStatusSchema>;

export type JobResult = z.infer<typeof JobResultSchema>;
