// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/chain/wallet_checker.py.
import { z } from 'zod';
import { Registry } from './registry';
import { RPC } from './rpc';
import { Subscription } from '../shared/subscription';
import {
  ERC20_ABI,
  WALLET_FACTORY_ABI,
  ZERO_ADDRESS,
} from '../utils/constants';
import { AddressSchema, ChecksumAddressSchema } from '../shared/schemas';

export class WalletChecker {
  static fieldSchemas = {
    _rpc: z.instanceof(RPC),
    _registry: z.instanceof(Registry),
    _payment_address: ChecksumAddressSchema,
    _accepted_payments: z.record(z.record(z.number())),
  };

  static methodSchemas = {
    is_valid_wallet: z
      .function()
      .args(AddressSchema)
      .returns(z.promise(z.boolean())),
    _erc20_balance: z
      .function()
      .args(AddressSchema, AddressSchema)
      .returns(z.promise(z.bigint())),
    has_enough_balance: z
      .function()
      .args(AddressSchema, AddressSchema, z.bigint())
      .returns(z.promise(z.tuple([z.boolean(), z.bigint()]))),
    matches_payment_requirements: z
      .function()
      .args(z.instanceof(Subscription))
      .returns(z.boolean()),
  };

  #rpc: z.infer<typeof WalletChecker.fieldSchemas._rpc>;
  #registry: z.infer<typeof WalletChecker.fieldSchemas._registry>;
  #payment_address: z.infer<typeof WalletChecker.fieldSchemas._payment_address>;
  #accepted_payments: z.infer<
    typeof WalletChecker.fieldSchemas._accepted_payments
  >;

  constructor(rpc, registry, container_configs, payment_address?) {
    this.#rpc = WalletChecker.fieldSchemas._rpc.parse(rpc);
    this.#registry = WalletChecker.fieldSchemas._registry.parse(registry);
    this.#payment_address = WalletChecker.fieldSchemas._payment_address.parse(
      payment_address ?? ZERO_ADDRESS
    );
    this.#accepted_payments =
      WalletChecker.fieldSchemas._accepted_payments.parse(
        container_configs.reduce((acc, { id, accepted_payments }) => {
          return {
            ...acc,
            [id]: accepted_payments,
          };
        }, {})
      );
  }

  // Check if a wallet is valid. Uses the `isValidWallet` function of the `WalletFactory` contract.
  is_valid_wallet = WalletChecker.methodSchemas.is_valid_wallet.implement(
    (address) => {
      const walletFactoryContract = this.#rpc.get_contract(
        this.#registry.wallet_factory,
        WALLET_FACTORY_ABI
      );

      return walletFactoryContract.read.isValidWallet([
        address,
      ]) as Promise<boolean>;
    }
  );

  // Get the ERC20 balance of a wallet.
  #erc20_balance = WalletChecker.methodSchemas._erc20_balance.implement(
    async (address, token) => {
      const tokenContract = this.#rpc.get_contract(token, ERC20_ABI);

      return tokenContract.read.balanceOf([address]) as Promise<bigint>;
    }
  );

  // Check if a wallet has enough balance.
  has_enough_balance = WalletChecker.methodSchemas.has_enough_balance.implement(
    async (address, token, amount) => {
      let balance;

      if (token === ZERO_ADDRESS) {
        balance = await this.#rpc.get_balance(address);
      } else {
        balance = await this.#erc20_balance(address, token);
      }

      return [balance >= amount, balance];
    }
  );

  // Check if a subscription matches payment requirements.
  matches_payment_requirements =
    WalletChecker.methodSchemas.matches_payment_requirements.implement(
      (sub) => {
        const skipBanner = `Skipping subscription: ${sub.id}`;

        if (this.#payment_address === ZERO_ADDRESS && sub.provides_payment) {
          console.info(
            `${skipBanner}: No payment address provided for the node`,
            {
              sub_id: sub.id,
            }
          );

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
    );
}
