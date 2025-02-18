// Reference: https://github.com/ritual-net/infernet-node/blob/cf254b9c9601883bd3a716b41028f686cd04b163/src/shared/message.py.
import { cloneDeep } from 'lodash';
import { CoordinatorSignatureParams } from '../chain/coordinator';
import { SerializedSubscription, Subscription } from './subscription';

// Message types.
export enum MessageType {
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
export interface DelegatedSubscriptionMessage extends BaseMessage {
  subscription: SerializedSubscription;
  signature: CoordinatorSignatureParams;
  data: {
    [key: string]: any;
  };
  type: MessageType.DelegatedSubscription;
  requires_proof?: boolean;
}

// On-chain subscription creation event.
export class SubscriptionCreatedMessage {
  subscription: Subscription;
  type = MessageType.SubscriptionCreated;
  requires_proof: boolean;

  constructor(_subscription: Subscription, _requires_proof: boolean = false) {
    this.subscription = _subscription;
    this.requires_proof = _requires_proof;
  }
}

// Type alias for off-chain originating message.
export type OffchainMessage = OffchainJobMessage | DelegatedSubscriptionMessage;

// Type alias for coordinator event messages.
export type CoordinatorMessage = SubscriptionCreatedMessage;

// Type alias for filtered event message.
export type FilteredMessage = OffchainMessage | CoordinatorMessage;

// Type alias for pre-filtered event messages.
export type PrefilterMessage = OffchainMessage | CoordinatorMessage;

// Type alias for on-chain processed messages.
export type OnchainMessage = CoordinatorMessage | DelegatedSubscriptionMessage;

export class GuardianError {
  message: PrefilterMessage;
  error: string;
  params: {
    [key: string]: any;
  };

  constructor(
    _message: PrefilterMessage,
    _error: string,
    _params: {
      [key: string]: any;
    }
  ) {
    this.message = _message;
    this.error = _error;
    this.params = cloneDeep(_params);
  }
}
