import { z } from 'zod';
import { isAddress } from 'viem';

export const NumberSchema = z.number();

export const StringSchema = z.string();

export const BooleanSchema = z.boolean();

export const ObjectSchema = z.object({});

export const DefaultNumberSchema = (value: number) =>
  NumberSchema.default(value);

export const DefaultStringSchema = (value: string) =>
  StringSchema.default(value);

export const DefaultBooleanSchema = (value: boolean) =>
  z.boolean().default(value);

export const AddressStringSchema = StringSchema.length(42).refine(
  (address: string) => isAddress(address, { strict: false })
);

export const ChecksumAddressStringSchema = StringSchema.length(42).refine(
  (address: string) => isAddress(address)
);

export const StrictObjectSchema = (value: any) => z.object(value).strict();

export const NumberArraySchema = NumberSchema.array();

export const StringArraySchema = StringSchema.array();
