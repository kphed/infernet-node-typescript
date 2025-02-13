// Reference: https://github.com/ritual-net/infernet-node/blob/3806e64bdb3867b462e1760aa7d84abe228f51da/src/chain/errors.py.
import { Hex } from 'viem';
import { Subscription } from '../shared/subscription';

enum CoordinatorError {
  InvalidWallet = '0x23455ba1',
  IntervalMismatch = '0x4db310c3',
  IntervalCompleted = '0x2f4ca85b',
  UnauthorizedVerifier = '0xb9857aa1',
  NodeRespondedAlready = '0x88a21e4f',
  SubscriptionNotFound = '0x1a00354f',
  ProofRequestNotFound = '0x1d68b37c',
  NotSubscriptionOwner = '0xa7fba711',
  SubscriptionCompleted = '0xae6704a7',
  SubscriptionNotActive = '0xefb74efe',
  UnsupportedVerifierToken = '0xe2372799',
}

enum EIP712CoordinatorError {
  SignerMismatch = '0x10c74b03',
  SignatureExpired = '0x0819bdcd',
}

enum WalletError {
  TransferFailed = '0x90b8ec18',
  InsufficientFunds = '0x356680b7',
  InsufficientAllowance = '0x13be252b',
}

enum AllowlistError {
  NodeNotAllowed = '0x42764946',
}

enum ERC20Error {
  InsufficientBalance = '0xf4d678b8',
}

const invalid_wallet_error = `
  Invalid wallet, please make sure you're using a wallet created
  from Infernet's \`WalletFactory\`.
`;
const interval_mismatch_error =
  'Interval mismatch. The interval is not the current one.';
const interval_completed_error =
  'Interval completed. Redundancy has been already met for the current interval';
const unauthorized_verifier_error = 'Verifier is not authorized.';
const node_responded_already_error = 'Node already responded for this interval';
const subscription_not_found_error = 'Subscription not found';
const proof_request_not_found_error = 'Proof request not found';
const not_subscription_owner_error =
  'Caller is not the owner of the subscription';
const subscription_completed_error = `
  Subscription is already completed, another node 
  has likely already delivered the response
`;
const subscription_not_active_error = 'Subscription is not active';
const unsupported_verifier_token_error = `
  Unsupported verifier token. Attempting to pay a \`IVerifier\`-contract in a token it
  does not support receiving payments in
`;
const signer_mismatch_error = 'Signer does not match.';
const signature_expired_error = 'EIP-712 Signature has expired.';
const transfer_failed_error = 'Token transfer failed.';
const insufficient_funds_error = `
  Insufficient funds. You either are trying to withdraw \`amount > unlockedBalance\` 
  or are trying to escrow \`amount > unlockedBalance\` or attempting to unlock 
  \`amount > lockedBalance\`
`;
const insufficient_allowance_error = 'Insufficient allowance.';
const node_not_allowed_error =
  'Node is not allowed to deliver this subscription.';
const insufficient_balance_error = 'Insufficient balance.';

export class InfernetError extends Error {}

/**
 * Checks if the error belongs to the infernet contracts based on its 4-byte signature,
 * and if it does, prints a helpful message and raises an InfernetError.
 */
export const raise_if_infernet_error = (
  encodedError: Hex,
  sub: Subscription
) => {
  const errors = {
    [CoordinatorError.InvalidWallet]: invalid_wallet_error,
    [CoordinatorError.IntervalMismatch]: interval_mismatch_error,
    [CoordinatorError.IntervalCompleted]: interval_completed_error,
    [CoordinatorError.UnauthorizedVerifier]: unauthorized_verifier_error,
    [CoordinatorError.NodeRespondedAlready]: node_responded_already_error,
    [CoordinatorError.SubscriptionNotFound]: subscription_not_found_error,
    [CoordinatorError.ProofRequestNotFound]: proof_request_not_found_error,
    [CoordinatorError.NotSubscriptionOwner]: not_subscription_owner_error,
    [CoordinatorError.SubscriptionCompleted]: subscription_completed_error,
    [CoordinatorError.SubscriptionNotActive]: subscription_not_active_error,
    [CoordinatorError.UnsupportedVerifierToken]:
      unsupported_verifier_token_error,
    [EIP712CoordinatorError.SignerMismatch]: signer_mismatch_error,
    [EIP712CoordinatorError.SignatureExpired]: signature_expired_error,
    [WalletError.TransferFailed]: transfer_failed_error,
    [WalletError.InsufficientFunds]: insufficient_funds_error,
    [WalletError.InsufficientAllowance]: insufficient_allowance_error,
    [AllowlistError.NodeNotAllowed]: node_not_allowed_error,
    [ERC20Error.InsufficientBalance]: insufficient_balance_error,
  };
  const errorSelectors = Object.keys(errors);

  for (let i = 0; i < errorSelectors.length; i++) {
    const errorSelector = errorSelectors[i];
    const errorMessage = errors[errorSelector];

    // Check whether the error data contains the error selector.
    if (encodedError.match(errorSelectors[i])) {
      if (
        errorSelector === CoordinatorError.NodeRespondedAlready ||
        errorSelector === CoordinatorError.SubscriptionCompleted ||
        errorSelector === CoordinatorError.IntervalCompleted
      ) {
        console.info(errorMessage, {
          subscription_id: sub.id,
        });
      } else {
        console.error(errorMessage, {
          subscription_id: sub.id,
        });
      }

      throw new InfernetError(errorMessage);
    }
  }
};
