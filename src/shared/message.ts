// Reference: https://github.com/ritual-net/infernet-node/blob/cf254b9c9601883bd3a716b41028f686cd04b163/src/shared/message.py.
import { CoordinatorSignatureParams } from '../chain/coordinator';
import { SerializedSubscription, Subscription } from './subscription';

// Message types.
enum MessageType {
  OffchainJob = 0,
  DelegatedSubscription = 1,
  SubscriptionCreated = 2,
}

// Base off-chain message.
export interface BaseMessage {
  id: string;
  ip: string;
}

// Off-chain orginating, off-chain delivery job message.
export interface OffchainJobMessage extends BaseMessage {
  containers: string[];
  data: { [key: string]: any };
  type: MessageType.OffchainJob;
  requires_proof?: boolean;
}

// Off-chain originating, on-chain delivery message.
interface DelegatedSubscriptionMessage extends BaseMessage {
  subscription: SerializedSubscription;
  signature: CoordinatorSignatureParams;
  data: {
    [key: string]: any;
  };
  type: MessageType.DelegatedSubscription;
  requires_proof?: boolean;
}

// On-chain subscription creation event.
interface SubscriptionCreatedMessage {
  subscription: Subscription;
  type: MessageType.SubscriptionCreated;
  requires_proof?: boolean;
}

// Type alias for off-chain originating message.
export type OffchainMessage = OffchainJobMessage | DelegatedSubscriptionMessage;

// Type alias for coordinator event messages.
type CoordinatorMessage = SubscriptionCreatedMessage;

// Type alias for filtered event message.
type FilteredMessage = OffchainMessage | CoordinatorMessage;

// Type alias for pre-filtered event messages.
type PrefilterMessage = OffchainMessage | CoordinatorMessage;

// Type alias for on-chain processed messages.
type OnchainMessage = CoordinatorMessage | DelegatedSubscriptionMessage;

interface GuardianError {
  message: PrefilterMessage;
  error: string;
  params: {
    [key: string]: any;
  };
}
