// Reference: https://github.com/ritual-net/infernet-node/blob/3806e64bdb3867b462e1760aa7d84abe228f51da/src/chain/payment_wallet.py.
import { Address, GetContractReturnType, Abi, Client } from 'viem';
import { ZERO_ADDRESS, PAYMENT_WALLET_ABI } from '../utils/constants';
import { RPC } from './rpc';

export class PaymentWallet {
  #address: Address;
  #rpc: RPC;

  constructor(address: Address = ZERO_ADDRESS, rpc: RPC) {
    this.#address = address;
    this.#rpc = rpc;
  }

  address(): Address {
    if (this.#address === ZERO_ADDRESS)
      throw new Error('PaymentWallet has no address');

    return this.#address;
  }

  /**
   * Get the `PaymentWallet` contract.
   */
  #get_contract(): GetContractReturnType<Abi, Client, Address> {
    return this.#rpc.get_contract(this.address(), PAYMENT_WALLET_ABI);
  }

  /**
   * Get the owner of the `PaymentWallet` contract.
   */
  async get_owner(): Promise<Address> {
    return this.#get_contract().read.owner() as Promise<Address>;
  }

  /**
   * Approve a spender to spend a certain amount of tokens.
   */
  async approve(
    spender: Address,
    token: Address,
    amount: BigInt
  ): Promise<void> {
    const contract = this.#get_contract();
    const owner = await this.get_owner();

    if (owner !== this.#rpc.account())
      throw new Error('RPC account must be contract owner');

    const hash = await contract.write.approve([spender, token, amount]);

    // Waits for the transaction to be included in a block, and returns the receipt.
    await this.#rpc.publicClient.waitForTransactionReceipt({ hash });

    const allowance = await contract.read.allowance([spender, token]) as BigInt;

    if (allowance !== amount)
      throw new Error('Allowance is not equal to the amount set.');
  }
}
