import { Hex } from 'viem';
import { CoordinatorSignatureParams } from './coordinator';
import { Subscription } from '../shared/subscription';
import { AsyncTask } from '../shared/service';

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

class ChainProcess extends AsyncTask {
  #rpc

  setup() {}

  cleanup() {}

  track() {}

  run_forever() {}
}
