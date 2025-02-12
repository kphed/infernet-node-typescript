// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/chain/wallet_checker.py.
import { Address } from 'viem';
import { Registry } from './registry';
import { RPC } from './rpc';
import { Subscription } from '../shared/subscription';
import {
  ERC20_ABI,
  WALLET_FACTORY_ABI,
  ZERO_ADDRESS,
} from '../utils/constants';
import { InfernetContainer } from '../shared/config';

export class WalletChecker {
  #rpc: RPC;
  #registry: Registry;
  #payment_address: Address;
  #accepted_payments: {
    [key: string]: {
      [key: string]: number;
    };
  };

  constructor(
    rpc: RPC,
    registry: Registry,
    container_configs: InfernetContainer[],
    payment_address: Address = ZERO_ADDRESS
  ) {
    this.#rpc = rpc;
    this.#registry = registry;
    this.#payment_address = payment_address;
    this.#accepted_payments = container_configs.reduce(
      (acc, { id, accepted_payments }) => {
        return {
          ...acc,
          [id]: accepted_payments,
        };
      },
      {}
    );
  }

  /**
   * Check if a wallet is valid. Uses the `isValidWallet` function of the
   * `WalletFactory` contract.
   */
  is_valid_wallet(address: Address): Promise<boolean> {
    const walletFactoryContract = this.#rpc.get_contract(
      this.#registry.wallet_factory(),
      WALLET_FACTORY_ABI
    );

    return walletFactoryContract.read.isValidWallet([
      address,
    ]) as Promise<boolean>;
  }

  /**
   * Get the ERC20 balance of a wallet.
   */
  async #erc20_balance(address: Address, token: Address): Promise<number> {
    const tokenContract = this.#rpc.get_contract(token, ERC20_ABI);

    return Number(
      (await tokenContract.read.balanceOf([address])) as Promise<bigint>
    );
  }

  /**
   * Check if a wallet has enough balance.
   */
  async has_enough_balance(
    address: Address,
    token: Address,
    amount: number
  ): Promise<[boolean, number]> {
    let balance;

    if (token === ZERO_ADDRESS) {
      balance = Number(await this.#rpc.get_balance(address));
    } else {
      balance = await this.#erc20_balance(address, token);
    }

    return [balance >= amount, balance];
  }
}
