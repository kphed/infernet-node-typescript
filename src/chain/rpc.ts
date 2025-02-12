// https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/rpc.py.
import {
  http,
  createWalletClient,
  WalletClient,
  Hex,
  Address,
  isAddress,
  encodeAbiParameters,
  keccak256,
  getAddress,
  toEventHash,
  getContract,
  Abi,
  GetContractReturnType,
  GetTransactionCountReturnType,
  GetBlockNumberReturnType,
  createPublicClient,
  PublicClient,
  GetLogsReturnType,
  TransactionSerializedGeneric,
  Client,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { delay } from '../utils/helpers';

export class RPC {
  #rpc_url: string;
  #private_key: Hex;
  publicClient: PublicClient;
  web3: WalletClient;

  constructor(rpc_url: string, private_key: Hex) {
    this.#rpc_url = rpc_url;
    this.#private_key = private_key;
    this.publicClient = createPublicClient({
      transport: http(rpc_url),
    });
    this.web3 = createWalletClient({
      account: privateKeyToAccount(private_key),
      transport: http(rpc_url),
    });
  }

  account(): Address {
    // Surer way of retrieving address since `this.web3.account.address` type is `Address | undefined`.
    return privateKeyToAccount(this.#private_key).address;
  }

  /**
   * Checks if an address is a correctly formatted Ethereum address.
   */
  static is_valid_address(address: string): boolean {
    return isAddress(address, { strict: true });
  }

  /**
   * Returns a keccak256 hash of packed ABI-encoded values.
   */
  static get_keccak(abi_types: string[], values: any[]): Hex {
    const abiTypes = abi_types.map((type) => ({ type }));

    return keccak256(encodeAbiParameters(abiTypes, values));
  }

  /**
   * Returns a checksummed Ethereum address.
   */
  static get_checksum_address(address: string): Address {
    return getAddress(address);
  }

  /**
   * Gets hashed event signature.
   */
  static get_event_hash(event_signature: string): Hex {
    return toEventHash(event_signature);
  }

  /**
   * Given contract details, creates new Contract instance.
   */
  get_contract(
    address: Address,
    abi: Abi
  ): GetContractReturnType<Abi, Client, Address> {
    return getContract({
      address,
      abi,
      client: this.web3,
    });
  }

  /**
   * Collects connected RPC's chain ID.
   */
  async get_chain_id(): Promise<number> {
    return this.web3.getChainId();
  }

  /**
   * Collects nonce for an address.
   */
  async get_nonce(address: Address): Promise<GetTransactionCountReturnType> {
    return this.publicClient.getTransactionCount({
      address,
    });
  }

  /**
   * Collects block data by block number.
   */
  async get_block_by_number(block_number: number) {
    return this.publicClient.getBlock({
      blockNumber: BigInt(block_number),
    });
  }

  /**
   * Collects latest confirmed block number from chain.
   */
  async get_head_block_number(): Promise<GetBlockNumberReturnType> {
    return this.publicClient.getBlockNumber();
  }
  /**
   * Collects tx success status by tx_hash with retries.
   */
  async get_tx_success_with_retries(
    tx_hash: Hex,
    retries: number = 10,
    sleep: number = 200
  ): Promise<[boolean, boolean]> {
    for (let i = 0; i < retries; i++) {
      const [found, successStatus] = await this.get_tx_success(tx_hash);

      if (found && successStatus) return [found, successStatus];

      await delay(sleep);
    }

    return [false, false];
  }

  /**
   * Collects tx success status by tx_hash.
   */
  async get_tx_success(tx_hash: Hex): Promise<[boolean, boolean]> {
    try {
      const { status } = await this.publicClient.getTransactionReceipt({
        hash: tx_hash,
      });

      return [true, status === 'success'];
    } catch (err: any) {
      return [false, false];
    }
  }

  /**
   * Returns event logs for a given set of parameters.
   *
   * TODO: Bridge web3.py and viem differences.
   */
  async get_event_logs(params): Promise<GetLogsReturnType> {
    const filter = await this.publicClient.createEventFilter();

    console.log('Created event filter', {
      id: filter.id,
    });

    const logs = await this.publicClient.getFilterLogs({ filter });

    console.log('Collected event logs', {
      count: logs.length,
    });

    return logs;
  }

  /**
   * Collects balance for an address.
   */
  async get_balance(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  /**
   * Sends signed transaction. Bubble up error traceback.
   */
  async send_transaction(tx: {
    rawTransaction: TransactionSerializedGeneric;
  }): Promise<Hex> {
    try {
      const hash = await this.web3.sendRawTransaction({
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
}
