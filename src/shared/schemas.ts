import { z } from 'zod';
import { isAddress } from 'viem';

export const AddressSchema = z
  .string()
  .length(42)
  .refine((address: string) => isAddress(address, { strict: false }), {
    message: 'Not a valid address.',
  });

export const ChecksumAddressSchema = z
  .string()
  .length(42)
  .refine((address: string) => isAddress(address), {
    message: 'Not a valid checksum address.',
  });

export const ByteStringSchema = z.string().min(2).startsWith('0x');
