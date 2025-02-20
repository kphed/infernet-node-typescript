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
    payment_address?: Address
  ) {
    this.#rpc = rpc;
    this.#registry = registry;
    this.#payment_address = payment_address ?? ZERO_ADDRESS;
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

  /**
   * Check if a subscription matches payment requirements.
   * 1. Ensure that payment address is provided.
   * 2. Check that the subscription matches the payment requirements.
   */
  matches_payment_requirements(sub: Subscription): boolean {
    const skipBanner = `Skipping subscription: ${sub.id}`;

    if (this.#payment_address === ZERO_ADDRESS && sub.provides_payment) {
      console.info(`${skipBanner}: No payment address provided for the node`, {
        sub_id: sub.id,
      });

      return false;
    }

    const containers = sub.containers;

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const accepted_payments = this.#accepted_payments[container];

      // No payment requirements for this container, it allows everything.
      if (!accepted_payments) continue;

      if (accepted_payments[sub.payment_token] === undefined) {
        console.info(
          `${skipBanner}: Token ${sub.payment_token} not 
          accepted for container ${container}.`,
          {
            sub_id: sub.id,
            token: sub.payment_token,
            container,
            accepted_tokens: Object.keys(accepted_payments),
          }
        );

        // Doesn't match, but requires payment.
        return false;
      }
    }

    // Minimum required payment for the subscription is the sum of the payment
    // requirements of each container.
    const minPayment = containers.reduce((acc, container) => {
      const paymentAmount =
        this.#accepted_payments[container]?.[sub.payment_token] ?? 0;

      return acc + paymentAmount;
    }, 0);

    if (sub.payment_amount < minPayment) {
      console.info(
        `${skipBanner}: Token ${sub.payment_token} below 
        minimum payment requirements.`,
        {
          sub_id: sub.id,
          token: sub.payment_token,
          sub_amount: sub.payment_amount,
          min_amount: minPayment,
        }
      );

      return false;
    }

    return true;
  }
}
