// Reference: https://github.com/ritual-net/infernet-node/blob/2632a0b43b54216fb9616ff0c925edfdf48d7004/src/chain/processor.py.
import { Hex } from 'viem';
import { Mutex } from 'async-mutex';
import { Coordinator, CoordinatorSignatureParams } from './coordinator';
import { InfernetError } from './errors';
import { PaymentWallet } from './paymentWallet';
import { Registry } from './registry';
import { RPC } from './rpc';
import { Wallet } from './wallet';
import { WalletChecker } from './walletChecker';
import { Orchestrator } from '../orchestration/orchestrator';
import {
  ContainerError,
  ContainerOutput,
  JobInput,
  JobLocation,
} from '../shared/job';
import {
  DelegatedSubscriptionMessage,
  MessageType,
  OnchainMessage,
  SubscriptionCreatedMessage,
} from '../shared/message';
import { AsyncTask } from '../shared/service';
import { Subscription } from '../shared/subscription';
import { ContainerLookup } from './containerLookup';

const BLOCKED: Hex = '0xblocked';

const RESPONSE_KEYS = [
  'raw_input',
  'processed_input',
  'raw_output',
  'processed_output',
  'proof',
];

type Interval = number;

type SubscriptionID = number;

type DelegateSubscriptionID = [Hex, number];

type UnionID = SubscriptionID | DelegateSubscriptionID;

type DelegateSubscriptionData = [
  Subscription,
  CoordinatorSignatureParams,
  { [key: string]: any }
];

const makeDelegateSubscriptionsKey = (
  subOwner: Hex,
  sigNonce: number
): string => `${subOwner}-${sigNonce}`;

const makePendingOrAttemptsKey = (id: UnionID, interval: Interval): string =>
  `${id}-${interval}`;

class ChainProcessor extends AsyncTask {
  #rpc: RPC;
  #coordinator: Coordinator;
  #wallet: Wallet;
  #payment_wallet: PaymentWallet;
  #wallet_checker: WalletChecker;
  #registry: Registry;
  #orchestrator: Orchestrator;
  #container_lookup: ContainerLookup;
  #subscriptions: {
    [key: SubscriptionID]: Subscription;
  };
  #delegate_subscriptions: {
    [key: string]: DelegateSubscriptionData;
  };
  #pending: {
    [key: string]: Hex;
  };
  #attempts: {
    [key: string]: number;
  };
  #attempts_lock: Mutex;

  constructor(
    rpc: RPC,
    coordinator: Coordinator,
    wallet: Wallet,
    payment_wallet: PaymentWallet,
    wallet_checker: WalletChecker,
    registry: Registry,
    orchestrator: Orchestrator,
    container_lookup: ContainerLookup
  ) {
    super();

    this.#rpc = rpc;
    this.#coordinator = coordinator;
    this.#wallet = wallet;
    this.#payment_wallet = payment_wallet;
    this.#wallet_checker = wallet_checker;
    this.#registry = registry;
    this.#orchestrator = orchestrator;
    this.#container_lookup = container_lookup;
    this.#subscriptions = {};
    this.#delegate_subscriptions = {};
    this.#pending = {};
    this.#attempts = {};

    console.info('Initialized ChainProcessor');

    this.#attempts_lock = new Mutex();
  }

  setup() {}

  cleanup() {}

  track() {}

  run_forever() {}
}
