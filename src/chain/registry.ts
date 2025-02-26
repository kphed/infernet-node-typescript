// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/registry.py.
import { z } from 'zod';
import { Address } from 'viem';
import { RPC } from './rpc';
import { REGISTRY_ABI } from '../utils/constants';
import { AddressSchema, ContractInstanceSchema } from '../shared/schemas';

const NotInitializedError = new Error(`
  Registry class has not been populated with contract addresses, please
  call populate_addresses() before accessing the contract addresses.  
`);

export class Registry {
  static fieldSchemas = {
    _coordinator: AddressSchema,
    _reader: AddressSchema,
    _wallet_factory: AddressSchema,
    _rpc: z.instanceof(RPC),
    _contract: ContractInstanceSchema,
  };

  static methodSchemas = {
    populate_addresses: z.function().returns(z.promise(z.void())),
    coordinator: {
      returns: AddressSchema,
    },
    reader: {
      returns: AddressSchema,
    },
    wallet_factory: {
      returns: AddressSchema,
    },
  };

  #coordinator!: z.infer<typeof Registry.fieldSchemas._coordinator>;
  #reader!: z.infer<typeof Registry.fieldSchemas._reader>;
  #wallet_factory!: z.infer<typeof Registry.fieldSchemas._wallet_factory>;
  #rpc: z.infer<typeof Registry.fieldSchemas._rpc>;
  #contract: z.infer<typeof Registry.fieldSchemas._contract>;

  constructor(rpc, address) {
    this.#rpc = Registry.fieldSchemas._rpc.parse(rpc);
    this.#contract = Registry.fieldSchemas._contract.parse(
      rpc.get_contract(address, REGISTRY_ABI)
    );
  }

  // Fetches Coordinator, Reader, and WalletFactory contract addresses from the Registry contract.
  populate_addresses = Registry.methodSchemas.populate_addresses.implement(
    async () => {
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
  );

  // Returns the address of the coordinator contract.
  get coordinator(): z.infer<
    typeof Registry.methodSchemas.coordinator.returns
  > {
    if (!this.#coordinator) throw NotInitializedError;

    return this.#coordinator;
  }

  // Returns the address of the reader contract.
  get reader(): z.infer<typeof Registry.methodSchemas.reader.returns> {
    if (!this.#reader) throw NotInitializedError;

    return this.#reader;
  }

  // Returns the address of the wallet factory contract.
  get wallet_factory(): z.infer<
    typeof Registry.methodSchemas.wallet_factory.returns
  > {
    if (!this.#wallet_factory) throw NotInitializedError;

    return this.#wallet_factory;
  }
}
