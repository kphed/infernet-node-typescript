// https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/rpc.py.
import { z } from 'zod';
import {
  http,
  createWalletClient,
  WalletClient,
  AbiEvent,
  isAddress,
  encodeAbiParameters,
  keccak256,
  getAddress,
  toEventHash,
  getContract,
  Abi,
  GetTransactionCountReturnType,
  GetBlockNumberReturnType,
  createPublicClient,
  PublicClient,
  TransactionSerializedGeneric,
  Block,
  CreateEventFilterParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { delay } from '../utils/helpers';
import {
  AddressSchema,
  ChecksumAddressSchema,
  ContractInstanceSchema,
  HexSchema,
} from '../shared/schemas';

const CreateEventFilterParams = z
  .object({
    address: AddressSchema.optional(),
    event: z.custom<AbiEvent>().optional(),
    args: z.record(z.any()).optional(),
    fromBlock: z.bigint().optional(),
    toBlock: z.bigint().optional(),
  })
  .strict();

export class RPC {
  static fieldSchemas = {
    _private_key: HexSchema,
    _wallet: z.custom<WalletClient>(),
    client: z.custom<PublicClient>(),
  };

  static methodSchemas = {
    wallet: {
      returns: this.fieldSchemas._wallet,
    },
    account: {
      returns: AddressSchema,
    },
    is_valid_address: z.function().args(z.string()).returns(z.boolean()),
    get_keccak: z
      .function()
      .args(z.string().array(), z.any().array())
      .returns(HexSchema),
    get_checksum_address: z
      .function()
      .args(z.string())
      .returns(ChecksumAddressSchema),
    get_event_hash: z.function().args(z.string()).returns(HexSchema),
    get_contract: z
      .function()
      .args(AddressSchema, z.custom<Abi>())
      .returns(ContractInstanceSchema),
    get_chain_id: z.function().returns(z.promise(z.number())),
    get_nonce: z
      .function()
      .args(AddressSchema)
      .returns(z.promise(z.custom<GetTransactionCountReturnType>())),
    get_block_by_number: z
      .function()
      .args(z.number())
      .returns(z.promise(z.custom<Block>())),
    get_head_block_number: z
      .function()
      .returns(z.promise(z.custom<GetBlockNumberReturnType>())),
    get_tx_success_with_retries: z
      .function()
      .args(HexSchema, z.number().optional(), z.number().optional())
      .returns(z.promise(z.tuple([z.boolean(), z.boolean()]))),
    get_tx_success: z
      .function()
      .args(HexSchema)
      .returns(z.promise(z.tuple([z.boolean(), z.boolean()]))),
    get_event_logs: z
      .function()
      .args(CreateEventFilterParams)
      .returns(z.promise(z.any())),
    get_balance: z
      .function()
      .args(AddressSchema)
      .returns(z.promise(z.bigint())),
    send_transaction: z
      .function()
      .args(
        z.object({
          rawTransaction: z.custom<TransactionSerializedGeneric>(),
        })
      )
      .returns(z.promise(HexSchema)),
  };

  #private_key: z.infer<typeof RPC.fieldSchemas._private_key>;
  #wallet: z.infer<typeof RPC.fieldSchemas._wallet>;
  client: z.infer<typeof RPC.fieldSchemas.client>;

  constructor(rpc_url, private_key) {
    this.#private_key = RPC.fieldSchemas._private_key.parse(private_key);
    this.#wallet = RPC.fieldSchemas._wallet.parse(
      createWalletClient({
        account: privateKeyToAccount(private_key),
        transport: http(rpc_url),
      })
    );
    this.client = RPC.fieldSchemas.client.parse(
      createPublicClient({
        transport: http(rpc_url),
      })
    );
  }

  // Returns a wallet client with the ability to sign transactions.
  get wallet(): z.infer<typeof RPC.methodSchemas.wallet.returns> {
    return this.#wallet;
  }

  // Returns the wallet client's primary account address.
  get account(): z.infer<typeof RPC.methodSchemas.account.returns> {
    // Surer way of retrieving address since `this.#wallet.account.address` type is `Address | undefined`.
    return privateKeyToAccount(this.#private_key).address;
  }

  // Checks if an address is a checksummed EVM address.
  static is_valid_address = this.methodSchemas.is_valid_address.implement(
    (address) => isAddress(address, { strict: true })
  );

  // Returns a keccak256 hash of ABI-encoded values.
  static get_keccak = this.methodSchemas.get_keccak.implement(
    (abi_types, values) => {
      const abiTypes = abi_types.map((type) => ({ type }));

      return keccak256(encodeAbiParameters(abiTypes, values));
    }
  );

  // Returns a checksummed EVM address.
  static get_checksum_address =
    this.methodSchemas.get_checksum_address.implement((address) =>
      getAddress(address)
    );

  // Gets hashed event signature.
  static get_event_hash = this.methodSchemas.get_event_hash.implement(
    (event_signature) => toEventHash(event_signature)
  );

  // Given contract details, creates new Contract instance.
  get_contract = RPC.methodSchemas.get_contract.implement((address, abi) =>
    getContract({
      address,
      abi,
      client: this.#wallet,
    })
  );

  // Gets the client chain ID.
  get_chain_id = RPC.methodSchemas.get_chain_id.implement(() =>
    this.#wallet.getChainId()
  );

  // Gets an account's nonce.
  get_nonce = RPC.methodSchemas.get_nonce.implement((address) =>
    this.client.getTransactionCount({
      address,
    })
  );

  // Gets block data for a block specified by number.
  get_block_by_number = RPC.methodSchemas.get_block_by_number.implement(
    (block_number) =>
      this.client.getBlock({
        blockNumber: BigInt(block_number),
      })
  );

  // Gets the latest confirmed block number.
  get_head_block_number = RPC.methodSchemas.get_head_block_number.implement(
    () => this.client.getBlockNumber()
  );

  // Gets the tx success status by `tx_hash` with retries.
  get_tx_success_with_retries =
    RPC.methodSchemas.get_tx_success_with_retries.implement(
      async (tx_hash, retries = 10, sleep = 200) => {
        for (let i = 0; i < retries; i++) {
          const [found, successStatus] = await this.get_tx_success(tx_hash);

          if (found && successStatus) return [found, successStatus];

          await delay(sleep);
        }

        return [false, false];
      }
    );

  // Gets the tx success status by `tx_hash`.
  get_tx_success = RPC.methodSchemas.get_tx_success.implement(
    async (tx_hash) => {
      try {
        const { status } = await this.client.getTransactionReceipt({
          hash: tx_hash,
        });

        return [true, status === 'success'];
      } catch (err: any) {
        return [false, false];
      }
    }
  );

  // Returns event logs for a given set of parameters.
  get_event_logs = RPC.methodSchemas.get_event_logs.implement(
    async (params) => {
      const filter = await this.client.createEventFilter(
        params as CreateEventFilterParameters
      );

      console.log('Created event filter', {
        id: filter.id,
      });

      const logs = await this.client.getFilterLogs({ filter });

      console.log('Collected event logs', {
        count: logs.length,
      });

      return logs;
    }
  );

  // Gets an account's native token (e.g. ETH) balance.
  get_balance = RPC.methodSchemas.get_balance.implement((address) =>
    this.client.getBalance({ address })
  );

  // Sends a transaction.
  send_transaction = RPC.methodSchemas.send_transaction.implement(
    async (tx: { rawTransaction }) => {
      try {
        const hash = await this.#wallet.sendRawTransaction({
          serializedTransaction: tx.rawTransaction,
        });

        return hash;
      } catch (err) {
        console.log('rpc.send_transaction failed', {
          error: err,
        });

        throw err;
      }
    }
  );
}
