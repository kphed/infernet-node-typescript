// Reference: https://github.com/ritual-net/infernet-node/blob/d2c02520e29cffb976f45ae7e3f5701c4a99e333/src/chain/wallet.py.
import { z } from 'zod';
import {
  Hex,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
} from 'viem';
import { privateKeyToAccount, PrivateKeyAccount } from 'viem/accounts';
import { Mutex } from 'async-mutex';
import {
  Coordinator,
  CoordinatorDeliveryParams,
  CoordinatorSignatureParamsSchema,
} from './coordinator';
import { raise_if_infernet_error } from './errors';
import { RPC } from './rpc';
import { Subscription } from '../shared/subscription';
import { ZERO_ADDRESS } from '../utils/constants';
import { delay } from '../utils/helpers';
import { ChecksumAddressSchema, HexSchema } from '../shared/schemas';

const ContractCustomErrorSchema = z.custom<Hex>(
  (val) => val.length === 10 && val.substring(0, 2) === '0x'
);

export class Wallet {
  static fieldSchemas = {
    _rpc: z.instanceof(RPC),
    _coordinator: z.instanceof(Coordinator),
    _max_gas_limit: z.bigint(),
    _account: z.custom<PrivateKeyAccount>(),
    _allowed_sim_errors: z.string().array(),
    _tx_lock: z.custom<Mutex>(),
    _payment_address: ChecksumAddressSchema,
  };

  static methodSchemas = {
    payment_address: {
      returns: ChecksumAddressSchema,
    },
    address: {
      returns: ChecksumAddressSchema,
    },
    _simulate_transaction: z
      .function()
      .args(z.function(), z.instanceof(Subscription))
      .returns(z.promise(z.boolean())),
    deliver_compute: z
      .function()
      .args(
        z.instanceof(Subscription),
        HexSchema,
        HexSchema,
        HexSchema,
        z.boolean()
      )
      .returns(z.promise(HexSchema)),
    deliver_compute_delegatee: z
      .function()
      .args(
        z.instanceof(Subscription),
        CoordinatorSignatureParamsSchema,
        HexSchema,
        HexSchema,
        HexSchema,
        z.boolean()
      )
      .returns(z.promise(HexSchema)),
  };

  #rpc: z.infer<typeof Wallet.fieldSchemas._rpc>;
  #coordinator: z.infer<typeof Wallet.fieldSchemas._coordinator>;
  #max_gas_limit: z.infer<typeof Wallet.fieldSchemas._max_gas_limit>;
  #account: z.infer<typeof Wallet.fieldSchemas._account>;
  #allowed_sim_errors: z.infer<typeof Wallet.fieldSchemas._allowed_sim_errors>;
  #tx_lock: z.infer<typeof Wallet.fieldSchemas._tx_lock>;
  #payment_address: z.infer<typeof Wallet.fieldSchemas._payment_address>;

  constructor(
    rpc,
    coordinator,
    private_key,
    max_gas_limit,
    payment_address = ZERO_ADDRESS,
    allowed_sim_errors
  ) {
    this.#rpc = Wallet.fieldSchemas._rpc.parse(rpc);
    this.#coordinator = Wallet.fieldSchemas._coordinator.parse(coordinator);
    this.#max_gas_limit =
      Wallet.fieldSchemas._max_gas_limit.parse(max_gas_limit);
    this.#account = Wallet.fieldSchemas._account.parse(
      privateKeyToAccount(private_key)
    );
    this.#allowed_sim_errors =
      Wallet.fieldSchemas._allowed_sim_errors.parse(allowed_sim_errors);
    this.#payment_address =
      Wallet.fieldSchemas._payment_address.parse(payment_address);
    this.#tx_lock = Wallet.fieldSchemas._tx_lock.parse(new Mutex());

    console.debug('Initialized Wallet', {
      address: this.#account.address,
    });
  }

  // Returns the checksummed node payment address.
  get payment_address(): z.infer<
    typeof Wallet.methodSchemas.payment_address.returns
  > {
    return Wallet.methodSchemas.payment_address.returns.parse(
      this.#payment_address
    );
  }

  // Returns the checksummed account address.
  get address(): z.infer<typeof Wallet.methodSchemas.address.returns> {
    return Wallet.methodSchemas.address.returns.parse(this.#account.address);
  }

  // Simulates the function call, and retries 3 times, with a 500ms delay if the tx reverts.
  #simulate_transaction = Wallet.methodSchemas._simulate_transaction.implement(
    async (fn, subscription) => {
      const simulateWithRetries = async (retries: number = 3) => {
        try {
          // `fn` should be a function that calls the contract method with the args passed as options.
          await fn({ from: this.#account.address });

          return false;
        } catch (err: any) {
          // Simulation errors may be bypassed if they are in the `allowed_sim_errors` list.
          // In which case, the simulation is considered to have passed.
          if (
            this.#allowed_sim_errors.find((allowed) =>
              err.message.toLowerCase().match(allowed.toLowerCase())
            ) !== undefined
          )
            return true;

          if (err instanceof BaseError) {
            const revertError: any = err.walk(
              (err) =>
                // Error types where the method was called, but reverted due to not meeting a condition.
                err instanceof ContractFunctionRevertedError ||
                err instanceof ContractFunctionExecutionError
            );
            const { data: customError } = ContractCustomErrorSchema.safeParse(
              revertError?.cause?.raw
            );

            if (customError) {
              // For infernet-specific errors, more verbose logging is provided, and an `InfernetError` is thrown.
              raise_if_infernet_error(customError, subscription);

              // If the error is not infernet-specific, log it.
              console.error('Failed to simulate transaction', {
                error: revertError,
                subscription: subscription,
              });
            } else if (revertError) {
              // Handle non-custom error tx reversions (e.g. a `require` statement throwing).
              console.warn('Contract logic error while simulating', {
                error: revertError,
                subscription: subscription,
              });
            }

            // Retry 3 times with a delay of 0.5 seconds if an error type matches and if there are retries remaining.
            if (revertError && retries) {
              await delay(500);

              return simulateWithRetries(retries - 1);
            }
          }

          throw err;
        }
      };

      return simulateWithRetries();
    }
  );

  // Simulates a `Coordinator.deliverCompute` call, and optionally send the tx.
  deliver_compute = Wallet.methodSchemas.deliver_compute.implement(
    async (subscription, input, output, proof, simulate_only) => {
      const fnArgs: CoordinatorDeliveryParams = {
        subscription,
        interval: subscription.interval,
        input,
        output,
        proof,
        node_wallet: this.payment_address,
      };
      const fn =
        this.#coordinator.get_deliver_compute_tx_contract_function(fnArgs);
      const skipped = await this.#simulate_transaction(fn, subscription);
      let txHash: Hex = '0x';

      if (simulate_only) return txHash;

      const txOptions: any = {};

      // By default, gas gets estimated (which includes a simulation call)
      // if we're purposefully skipping an error in simulation, we need to set gas
      // limit manually.
      if (skipped) txOptions.gas = this.#max_gas_limit;

      // Executes the callback once the mutex is unlocked.
      await this.#tx_lock.runExclusive(async () => {
        const { request }: any = await fn(txOptions);

        txHash = await this.#rpc.wallet.writeContract(request);
      });

      return txHash;
    }
  );

  // Simulates a `Coordinator.deliverComputeDelegatee` call, and optionally send the tx.
  deliver_compute_delegatee =
    Wallet.methodSchemas.deliver_compute_delegatee.implement(
      async (subscription, signature, input, output, proof, simulate_only) => {
        const fnArgs: CoordinatorDeliveryParams = {
          subscription,
          interval: subscription.interval,
          input,
          output,
          proof,
          node_wallet: this.payment_address,
        };
        const fn =
          this.#coordinator.get_deliver_compute_delegatee_tx_contract_function(
            fnArgs,
            signature
          );
        const skipped = await this.#simulate_transaction(fn, subscription);
        let txHash: Hex = '0x';

        if (simulate_only) return txHash;

        const txOptions: any = {};

        if (skipped) txOptions.gas = this.#max_gas_limit;

        // Executes the callback once the mutex is unlocked.
        await this.#tx_lock.runExclusive(async () => {
          const { request }: any = await fn(txOptions);

          txHash = await this.#rpc.wallet.writeContract(request);
        });

        return txHash;
      }
    );
}
