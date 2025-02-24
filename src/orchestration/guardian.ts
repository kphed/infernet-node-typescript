// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/orchestration/guardian.py.
import { z } from 'zod';
import { Address4, Address6 } from 'ip-address';
import { cloneDeep } from 'lodash';
import { ContainerLookup } from '../chain';
import { WalletChecker } from '../chain';
import { InfernetContainer } from '../shared/config';
import {
  DelegatedSubscriptionMessage,
  FilteredMessage,
  GuardianError,
  MessageType,
  OffchainJobMessage,
  PrefilterMessage,
  SubscriptionCreatedMessage,
} from '../shared/message';
import { getUnixTimestamp } from '../utils/helpers';
import { AddressSchema } from '../shared/schemas';

export const IPv4Schema = z.custom<Address4>();

export const IPv6Schema = z.custom<Address6>();

export const ContainerRestrictionsSchema = z
  .object({
    allowed_ips: z.union([IPv4Schema, IPv6Schema]).array(),
    allowed_addresses: AddressSchema.array(),
    allowed_delegate_addresses: AddressSchema.array(),
    external: z.boolean(),
    generates_proofs: z.boolean(),
  })
  .strict();

export type IPv4Type = z.infer<typeof IPv4Schema>;

export type IPv6Type = z.infer<typeof IPv6Schema>;

export type ContainerRestrictions = z.infer<typeof ContainerRestrictionsSchema>;

// Helper which replicates Python's `ipaddress.ip_network` functionality.
// Reference: https://docs.python.org/3/library/ipaddress.html#ipaddress.ip_network.
const getIpNetwork = (
  address: string,
  strict: boolean
): IPv4Type | IPv6Type => {
  // Identify whether the address is an IPv4 address.
  const isV4 = Address4.isValid(address);

  const _address = isV4 ? new Address4(address) : new Address6(address);
  const startAddress = _address.startAddress().address;

  if (strict && _address.addressMinusSuffix !== startAddress)
    throw new Error('Network has host bits set.');

  // The new IP address with the host bits zeroed out.
  const newAddress = `${startAddress}/${_address.parsedSubnet}`;

  return isV4
    ? IPv4Schema.parse(new Address4(newAddress))
    : IPv6Schema.parse(new Address6(newAddress));
};

export class Guardian {
  static fieldSchemas = {
    _chain_enabled: z.boolean(),
    _container_lookup: z.instanceof(ContainerLookup),
    _wallet_checker: z.instanceof(WalletChecker).optional(),
    _restrictions: z.record(ContainerRestrictionsSchema),
  };

  #chain_enabled: z.infer<typeof Guardian.fieldSchemas._chain_enabled>;
  #container_lookup: z.infer<typeof Guardian.fieldSchemas._container_lookup>;
  #wallet_checker?: z.infer<typeof Guardian.fieldSchemas._wallet_checker>;
  #restrictions: z.infer<typeof Guardian.fieldSchemas._restrictions>;

  constructor(configs, chain_enabled, container_lookup, wallet_checker?) {
    this.#chain_enabled =
      Guardian.fieldSchemas._chain_enabled.parse(chain_enabled);
    this.#container_lookup =
      Guardian.fieldSchemas._container_lookup.parse(container_lookup);
    this.#wallet_checker =
      Guardian.fieldSchemas._wallet_checker.parse(wallet_checker);
    this.#restrictions = Guardian.fieldSchemas._restrictions.parse(
      configs.reduce(
        (
          acc,
          {
            id,
            allowed_ips,
            allowed_addresses,
            allowed_delegate_addresses,
            external,
            generates_proofs,
          }
        ) => {
          const restriction: ContainerRestrictions = {
            allowed_ips: allowed_ips.map((ip) => getIpNetwork(ip, false)),
            allowed_addresses: allowed_addresses.map((address) =>
              AddressSchema.parse(address.toLowerCase())
            ),
            allowed_delegate_addresses: allowed_delegate_addresses.map(
              (address) => AddressSchema.parse(address.toLowerCase())
            ),
            external,
            generates_proofs,
          };

          return {
            ...acc,
            [id]: restriction,
          };
        },
        {} as {
          [key: string]: ContainerRestrictions;
        }
      )
    );

    console.debug('Initialized Guardian');
  }

  /**
   * Wallet checker getter, unpacks the optional `#wallet_checker` attribute, check
   * if it is undefined and throws an error if it is.
   */
  get wallet_checker(): WalletChecker {
    if (!this.#wallet_checker)
      throw new Error('Wallet checker not provided when chain is disabled.');

    return this.#wallet_checker;
  }

  /**
   * Returns a deep copy of `#restrictions`.
   */
  get restrictions(): { [key: string]: ContainerRestrictions } {
    return cloneDeep(this.#restrictions);
  }

  /**
   * Returns whether a container is external.
   */
  #is_external(container: string): boolean {
    return this.#restrictions[container].external;
  }

  /**
   * Returns whether a container generates proofs.
   */
  #generates_proof(container: string): boolean {
    return this.#restrictions[container].generates_proofs;
  }

  /**
   * Returns whether an IP address is allowed for a container.
   */
  #is_allowed_ip(container: string, address: string): boolean {
    if (!this.#restrictions[container].allowed_ips.length) return true;

    const isV4 = Address4.isValid(address);
    const addressBN = (
      isV4 ? new Address4(address) : new Address6(address)
    ).bigInt();

    return !!this.#restrictions[container].allowed_ips.find((ipNetwork) => {
      const ipNetworkIsV4 = Address4.isValid(ipNetwork.address);

      if ((isV4 && !ipNetworkIsV4) || (!isV4 && ipNetworkIsV4))
        throw new Error('IP version mismatch.');

      // Convert IP addresses to their numeric values, and check whether the address is in range.
      const networkStartAddressBN = ipNetwork.startAddress().bigInt();
      const networkEndAddressBN = ipNetwork.endAddress().bigInt();

      if (
        networkStartAddressBN <= addressBN &&
        addressBN <= networkEndAddressBN
      )
        return true;
    });
  }

  /**
   * Returns whether onchain address is allowed for container.
   */
  #is_allowed_address(
    container: string,
    address: string,
    onchain: boolean
  ): boolean {
    let restrictions;

    if (onchain) {
      restrictions = this.#restrictions[container].allowed_addresses;
    } else {
      restrictions = this.#restrictions[container].allowed_delegate_addresses;
    }

    if (!restrictions.length) return true;

    return !!restrictions.find(
      (allowedAddress) => allowedAddress === address.toLowerCase()
    );
  }

  /**
   * Create error message for given message id.
   */
  #error(
    message: PrefilterMessage,
    error: string,
    params?: any
  ): GuardianError {
    return new GuardianError(message, error, params);
  }

  /**
   * Filters off-chain job messages (off-chain creation and delivery).
   *
   * Filters:
   * 1. Checks if at least 1 container ID is present in message.
   * 2. Checks if any message container IDs are unsupported.
   * 3. Checks if request IP is allowed for container.
   * 4. Checks if first container ID is external container.
   * 5. Checks if the last container in the pipeline generates a proof if the
   *    message requires one.
   */
  #process_offchain_message(
    message: OffchainJobMessage
  ): GuardianError | OffchainJobMessage {
    if (!message.containers.length)
      return this.#error(message, 'No containers specified');

    for (let i = 0; i < message.containers.length; i++) {
      const container = message.containers[i];

      // Filter out containers that are not supported.
      if (!this.#restrictions[container])
        return this.#error(message, 'Container not supported', container);

      // Filter out containers that are not allowed for the IP.
      if (!this.#is_allowed_ip(container, message.ip))
        return this.#error(message, 'Container not allowed for address', {
          container,
          address: message.ip,
        });
    }

    const [firstContainer] = message.containers;

    // Filter out internal first container.
    if (!this.#is_external(firstContainer))
      return this.#error(message, 'First container must be external', {
        first_container: firstContainer,
      });

    const [lastContainer] = message.containers.slice(-1);

    if (message.requires_proof && !this.#generates_proof(lastContainer))
      return this.#error(message, 'Container does not generate proof', {
        container: lastContainer,
      });

    return message;
  }

  /**
   * Filters delegated Subscription messages (off-chain creation, on-chain delivery).
   *
   * Filters:
   * 1. Checks if chain module is enabled.
   * 2. Signature checks:
   *    2.1. Checks that signature expiry is valid.
   * 3. Checks if at least 1 container ID is present in subscription.
   * 4. Checks if subscription owner is in allowed addresses.
   * 5. Checks if first container ID is external container.
   * 6. Checks if any subscription container IDs are unsupported.
   * 7. Checks if subscription requires proof but the last container in their
   * pipeline does not generate one.
   *
   * Non-filters:
   * 1. Does not check if signature itself is valid (handled by processor).
   * 2. Does not check if owner has delegated a signer (handled by processor).
   */
  #process_delegated_subscription_message(
    message: DelegatedSubscriptionMessage
  ): GuardianError | DelegatedSubscriptionMessage {
    // Filter out if chain not enabled.
    if (!this.#chain_enabled)
      return this.#error(message, 'Chain not enabled', {
        delegated_subscription: message,
      });

    // Filter out expired signature.
    if (message.signature.expiry < getUnixTimestamp())
      return this.#error(message, 'Signature expired', {
        delegated_subscription: message,
      });

    const subscription = message.subscription.deserialize(
      this.#container_lookup
    );
    const subscriptionContainers = subscription.containers;

    for (let i = 0; i < subscriptionContainers.length; i++) {
      const container = subscriptionContainers[i];

      // Filter out containers that are not supported.
      if (!this.#restrictions[container])
        return this.#error(message, 'Container not supported', { container });

      // Filter out unallowed subscription recipients.
      if (!this.#is_allowed_address(container, subscription.owner, false))
        return this.#error(message, 'Container not allowed for address', {
          container,
          address: subscription.owner,
        });
    }

    const [firstContainer] = subscriptionContainers;

    if (!this.#is_external(firstContainer))
      return this.#error(message, 'First container must be external', {
        first_container: firstContainer,
      });

    const [lastContainer] = subscriptionContainers.slice(-1);

    // Filter out subscriptions that require proofs but the last container in their
    // pipeline does not generate one.
    if (subscription.requires_proof && !this.#generates_proof(lastContainer))
      return this.#error(message, 'Container does not generate proof', {
        container: lastContainer,
      });

    return message;
  }

  /**
   * Filters on-chain Coordinator subscription creation messages.
   *
   * Filters:
   * 1. Checks if subscription is complete.
   * 2. Checks if at least 1 container ID is present in subscription.
   * 3. Checks if first container ID is external container.
   * 4. Checks if any subscription container IDs are unsupported.
   * 5. Checks if subscription owner is in allowed addresses.
   * 6. Checks if subscription requires proof but the last container in their
   *    pipeline does not generate one.
   */
  #process_coordinator_created_message(
    message: SubscriptionCreatedMessage
  ): GuardianError | SubscriptionCreatedMessage {
    const { subscription } = message;

    if (subscription.completed)
      return this.#error(message, 'Subscription completed');

    const subscriptionContainers = subscription.containers;

    if (!subscriptionContainers.length)
      return this.#error(message, 'Container-set not supported', {
        containers_hash: subscription.containers_hash,
      });

    console.debug(`Subscription containers: ${subscriptionContainers}`);

    const [firstContainer] = subscriptionContainers;

    if (!this.#is_external(firstContainer))
      return this.#error(message, 'First container must be external', {
        first_container: firstContainer,
      });

    for (let i = 0; i < subscriptionContainers.length; i++) {
      const container = subscriptionContainers[i];

      if (!this.#is_allowed_address(container, subscription.owner, true))
        return this.#error(message, 'Container not allowed for address', {
          container,
          address: subscription.owner,
        });
    }

    const [lastContainer] = subscriptionContainers.slice(-1);

    // Filter out subscriptions that require proof but the last container in their
    // pipeline does not generate one.
    if (subscription.requires_proof && !this.#generates_proof(lastContainer))
      return this.#error(message, 'Container does not generate proof', {
        container: lastContainer,
      });

    // Filter out subscriptions that don't match payment requirements.
    if (!this.wallet_checker.matches_payment_requirements(subscription))
      return this.#error(message, 'Invalid payment', {
        subscription_id: subscription.id,
      });

    return message;
  }

  /**
   * Public method to parse and filter message.
   *
   * Routes message to appropriate filter method based on message type.
   */
  process_message(message: PrefilterMessage): GuardianError | FilteredMessage {
    switch (message.type) {
      case MessageType.OffchainJob:
        return this.#process_offchain_message(message as OffchainJobMessage);
      case MessageType.DelegatedSubscription:
        return this.#process_delegated_subscription_message(
          message as DelegatedSubscriptionMessage
        );
      case MessageType.SubscriptionCreated:
        return this.#process_coordinator_created_message(message);
      default:
        return this.#error(message, 'Not supported', { raw: message });
    }
  }
}
