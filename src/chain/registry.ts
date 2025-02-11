// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/registry.py.
import { Address, GetContractReturnType, Abi, Client } from 'viem';
import { RPC } from './rpc';
import { REGISTRY_ABI } from '../utils/constants';

const NotInitializedError = new Error(`
  Registry class has not been populated with contract addresses, please
  call populate_addresses() before accessing the contract addresses.  
`);

export class Registry {
  #coordinator?: Address;
  #reader?: Address;
  #wallet_factory?: Address;
  #rpc: RPC;
  #contract: GetContractReturnType<Abi, Client, Address>;

  constructor(rpc: RPC, address: Address) {
    this.#rpc = rpc;
    this.#contract = rpc.get_contract(address, REGISTRY_ABI);
  }

  /**
   * Populates the addresses of the coordinator, reader, and wallet factory contracts
   * from the registry contract.
   */
  async populate_addresses(): Promise<void> {
    console.log('Populating addresses for registry');

    this.#coordinator = (await this.#contract.read.COORDINATOR()) as Address;
    this.#reader = (await this.#contract.read.READER()) as Address;
    this.#wallet_factory =
      (await this.#contract.read.WALLET_FACTORY()) as Address;

    console.debug('Found addresses', {
      coordinator: this.#coordinator,
      reader: this.#reader,
      wallet_factory: this.#wallet_factory,
    });
  }

  /**
   * Returns the address of the coordinator contract.
   */
  coordinator(): Address {
    if (!this.#coordinator) throw NotInitializedError;

    return this.#coordinator;
  }

  /**
   * Returns the address of the reader contract.
   */
  reader(): Address {
    if (!this.#reader) throw NotInitializedError;

    return this.#reader;
  }

  /**
   * Returns the address of the wallet factory contract.
   */
  wallet_factory(): Address {
    if (!this.#wallet_factory) throw NotInitializedError;

    return this.#wallet_factory;
  }
}
