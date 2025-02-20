// Reference: https://github.com/ritual-net/infernet-node/blob/d2c02520e29cffb976f45ae7e3f5701c4a99e333/src/chain/wallet.py.
import {
  Hex,
  Address,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
} from 'viem';
import { privateKeyToAccount, PrivateKeyAccount } from 'viem/accounts';
import { Mutex } from 'async-mutex';
import {
  Coordinator,
  CoordinatorDeliveryParams,
  CoordinatorSignatureParams,
} from './coordinator';
import { raise_if_infernet_error } from './errors';
import { RPC } from './rpc';
import { Subscription } from '../shared/subscription';
import { ZERO_ADDRESS } from '../utils/constants';
import { delay } from '../utils/helpers';

export class Wallet {
  #rpc: RPC;
  #coordinator: Coordinator;
  #max_gas_limit: BigInt;
  #account: PrivateKeyAccount;
  #allowed_sim_errors: string[];
  #tx_lock: Mutex;
  payment_address: Address;

  constructor(
    rpc: RPC,
    coordinator: Coordinator,
    private_key: Hex,
    max_gas_limit: BigInt,
    payment_address: Address = ZERO_ADDRESS,
    allowed_sim_errors: string[]
  ) {
    if (private_key.substring(0, 2) !== '0x')
      throw new Error('Private key must be 0x-prefixed');

    this.#rpc = rpc;
    this.#coordinator = coordinator;
    this.#max_gas_limit = max_gas_limit;
    this.#account = privateKeyToAccount(private_key);
    this.#allowed_sim_errors = allowed_sim_errors;
    this.payment_address = payment_address;
    this.#tx_lock = new Mutex();

    console.debug('Initialized Wallet', {
      address: this.#account.address,
    });
  }

  /**
   * Returns wallet address.
   */
  get address(): Address {
    return this.#account.address;
  }

  /**
   * Simulates the function call, retrying 3 times with a delay of 0.5 and
   * raises if there are errors.
   *
   * Simulation errors may be bypassed if they are in the `allowed_sim_errors` list.
   * In which case, the simulation is considered to have passed.
   *
   * For infernet-specific errors, more verbose logging is provided, and an `InfernetError` is raised.
   *
   * The rest of the errors bubble up as is.
   */
  async #simulate_transaction(
    fn: any,
    subscription: Subscription
  ): Promise<boolean> {
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
          const revertError = err.walk(
            (err) =>
              err instanceof ContractFunctionRevertedError ||
              err instanceof ContractFunctionExecutionError
          );
          const functionReverted =
            revertError instanceof ContractFunctionRevertedError;
          const executionError =
            revertError instanceof ContractFunctionExecutionError;

          if (functionReverted && revertError.raw) {
            // For infernet-specific errors, more verbose logging is provided, and an `InfernetError` is thrown.
            raise_if_infernet_error(revertError.raw, subscription);

            // If the error is not infernet-specific, log it.
            console.error('Failed to simulate transaction', {
              error: revertError,
              subscription: subscription,
            });
          } else if (executionError) {
            console.warn('Contract logic error while simulating', {
              error: revertError,
              subscription: subscription,
            });
          }

          // Retry 3 times with a delay of 0.5 seconds if an error type matches and if there are retries remaining.
          if ((functionReverted || executionError) && retries) {
            await delay(500);

            return simulateWithRetries(retries - 1);
          }
        }

        throw err;
      }
    };

    return simulateWithRetries();
  }

  /**
   * Sends Coordinator.deliverCompute() tx.
   *
   * Transactions are first simulated using `.call()`. If simulation fails, the
   * error is bubbled up. This is to prevent submission of invalid transactions that
   * result in the user's gas being wasted.
   *
   * If a simulation passes & transaction still fails, it will be retried thrice.
   */
  async deliver_compute(
    subscription: Subscription,
    input: Hex,
    output: Hex,
    proof: Hex,
    simulate_only: boolean
  ): Promise<Hex> {
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

      txHash = await this.#rpc.web3.writeContract(request);
    });

    return txHash;
  }

  /**
   * Send Coordinator.deliverComputeDelegatee() tx.
   *
   * Transactions are first simulated using `.call()` to prevent submission of invalid
   * transactions that result in the user's gas being wasted.
   *
   * If a simulation passes & transaction still fails, it will be retried thrice.
   */
  async deliver_compute_delegatee(
    subscription: Subscription,
    signature: CoordinatorSignatureParams,
    input: Hex,
    output: Hex,
    proof: Hex,
    simulate_only: boolean
  ): Promise<Hex> {
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

      txHash = await this.#rpc.web3.writeContract(request);
    });

    return txHash;
  }
}
