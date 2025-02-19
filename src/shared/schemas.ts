import { z } from 'zod';
import { isAddress } from 'viem';

export const AddressSchema = z
  .string()
  .length(42)
  .refine((address: string) => isAddress(address, { strict: false }));

export const ChecksumAddressSchema = z
  .string()
  .length(42)
  .refine((address: string) => isAddress(address));
