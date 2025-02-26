// Reference: https://github.com/ritual-net/infernet-node/blob/3806e64bdb3867b462e1760aa7d84abe228f51da/src/chain/payment_wallet.py.
import { z } from 'zod';
import { Address } from 'viem';
import { ZERO_ADDRESS, PAYMENT_WALLET_ABI } from '../utils/constants';
import { RPC } from './rpc';
import {
  AddressSchema,
  ChecksumAddressSchema,
  ContractInstanceSchema,
} from '../shared/schemas';

export class PaymentWallet {
  static fieldSchemas = {
    _address: ChecksumAddressSchema.default(ZERO_ADDRESS),
    _rpc: z.instanceof(RPC),
  };

  static methodSchemas = {
    address: {
      returns: ChecksumAddressSchema,
    },
    _get_contract: z.function().returns(ContractInstanceSchema),
    get_owner: z.function().returns(z.promise(ChecksumAddressSchema)),
    approve: z
      .function()
      .args(AddressSchema, AddressSchema, z.bigint())
      .returns(z.promise(z.void())),
  };

  #address: z.infer<typeof PaymentWallet.fieldSchemas._address>;
  #rpc: z.infer<typeof PaymentWallet.fieldSchemas._rpc>;
  #contract: any;

  constructor(address, rpc) {
    this.#address = PaymentWallet.fieldSchemas._address.parse(address);
    this.#rpc = PaymentWallet.fieldSchemas._rpc.parse(rpc);
    this.#contract = this.#rpc.get_contract(this.address, PAYMENT_WALLET_ABI);
  }

  // Returns the address of the `PaymentWallet` contract.
  get address(): z.infer<typeof PaymentWallet.methodSchemas.address.returns> {
    if (this.#address === ZERO_ADDRESS)
      throw new Error('PaymentWallet has no address');

    return this.#address;
  }

  // Get the owner of the `PaymentWallet` contract.
  get_owner = PaymentWallet.methodSchemas.get_owner.implement(
    async () => this.#contract.read.owner() as Promise<Address>
  );

  // Approve a spender to spend a certain amount of tokens.
  approve = PaymentWallet.methodSchemas.approve.implement(
    async (spender, token, amount) => {
      const owner = await this.get_owner();

      if (owner !== this.#rpc.account)
        throw new Error('RPC account must be contract owner');

      const hash = await this.#contract.write.approve([spender, token, amount]);

      // Waits for the transaction to be included in a block, and returns the receipt.
      await this.#rpc.client.waitForTransactionReceipt({ hash });

      const allowance = (await this.#contract.read.allowance([
        spender,
        token,
      ])) as BigInt;

      if (allowance !== amount)
        throw new Error('Allowance is not equal to the amount set.');
    }
  );
}
