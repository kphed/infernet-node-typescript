// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/orchestration/guardian.py.
import { z } from 'zod';
import { Address4, Address6 } from 'ip-address';
import { LRUCache } from 'lru-cache';
import { ContainerLookup } from '../chain';
import { WalletChecker } from '../chain';
import {
  DelegatedSubscriptionMessage,
  GuardianError,
  MessageType,
  OffchainJobMessage,
  PrefilterMessageSchema,
  OffchainJobMessageSchema,
  DelegatedSubscriptionMessageSchema,
  SubscriptionCreatedMessageSchema,
  FilteredMessageSchema,
} from '../shared/message';
import { getUnixTimestamp } from '../utils/helpers';
import { AddressSchema } from '../shared/schemas';

export const IPv4Schema = z.custom<Address4>();

export const IPv6Schema = z.custom<Address6>();

export const GetIpNetworkSchema = z
  .function()
  .args(z.string(), z.boolean())
  .returns(z.union([IPv4Schema, IPv6Schema]));

export const ContainerRestrictionsSchema = z
  .object({
    allowed_ips: z
      .object({
        isV4: z.boolean(),
        startAddressBN: z.bigint(),
        endAddressBN: z.bigint(),
      })
      .strict()
      .array(),
    allowed_ips_cache: z.custom<LRUCache<bigint, boolean>>(),
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
const getIpNetwork = GetIpNetworkSchema.implement((address, strict) => {
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
});

export class Guardian {
  static fieldSchemas = {
    _chain_enabled: z.boolean(),
    _container_lookup: z.instanceof(ContainerLookup),
    _wallet_checker: z.instanceof(WalletChecker).optional(),
    _restrictions: z.record(ContainerRestrictionsSchema),
  };

  static methodSchemas = {
    wallet_checker: {
      returns: this.fieldSchemas._wallet_checker,
    },
    restrictions: {
      returns: this.fieldSchemas._restrictions,
    },
    _is_external: z.function().args(z.string()).returns(z.boolean()),
    _generates_proof: z.function().args(z.string()).returns(z.boolean()),
    _is_allowed_ip: z
      .function()
      .args(z.string(), z.string())
      .returns(z.boolean()),
    _is_allowed_address: z
      .function()
      .args(z.string(), z.string(), z.boolean())
      .returns(z.boolean()),
    _error: z
      .function()
      .args(PrefilterMessageSchema, z.string(), z.any().optional())
      .returns(z.instanceof(GuardianError)),
    _process_offchain_message: z
      .function()
      .args(OffchainJobMessageSchema)
      .returns(
        z.union([z.instanceof(GuardianError), OffchainJobMessageSchema])
      ),
    _process_delegated_subscription_message: z
      .function()
      .args(DelegatedSubscriptionMessageSchema)
      .returns(
        z.union([
          z.instanceof(GuardianError),
          DelegatedSubscriptionMessageSchema,
        ])
      ),
    _process_coordinator_created_message: z
      .function()
      .args(SubscriptionCreatedMessageSchema)
      .returns(
        z.union([z.instanceof(GuardianError), SubscriptionCreatedMessageSchema])
      ),
    process_message: z
      .function()
      .args(PrefilterMessageSchema)
      .returns(z.union([z.instanceof(GuardianError), FilteredMessageSchema])),
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
            allowed_ips: allowed_ips.map((ip) => {
              const ipNetwork = getIpNetwork(ip, false);

              // Extract the IP version, and the numeric values of the network's IP address range,
              // which will later be used to determine whether IPs are allowed.
              return {
                isV4: Address4.isValid(ipNetwork.address),
                startAddressBN: ipNetwork.startAddress().bigInt(),
                endAddressBN: ipNetwork.endAddress().bigInt(),
              };
            }),
            allowed_addresses: allowed_addresses.map((address) =>
              AddressSchema.parse(address.toLowerCase())
            ),
            allowed_delegate_addresses: allowed_delegate_addresses.map(
              (address) => AddressSchema.parse(address.toLowerCase())
            ),
            external,
            generates_proofs,
            allowed_ips_cache:
              ContainerRestrictionsSchema.shape.allowed_ips_cache.parse(
                // Allow 100 unique IPs (keyed by their BigInt value) to be checked and cached for each container.
                new LRUCache({ max: 100 })
              ),
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

  // Returns a deep clone of `#wallet_checker`.
  get wallet_checker(): z.infer<
    typeof Guardian.methodSchemas.wallet_checker.returns
  > {
    if (!this.#wallet_checker)
      throw new Error('Wallet checker not provided when chain is disabled.');

    return Guardian.methodSchemas.wallet_checker.returns.parse(
      this.#wallet_checker
    );
  }

  // Returns a deep clone of `#restrictions`.
  get restrictions(): z.infer<
    typeof Guardian.methodSchemas.restrictions.returns
  > {
    return Guardian.methodSchemas.restrictions.returns.parse(
      this.#restrictions
    );
  }

  // Returns whether a container is external.
  #is_external = Guardian.methodSchemas._is_external.implement(
    (container) => this.#restrictions[container].external
  );

  // Returns whether a container generates proofs.
  #generates_proof = Guardian.methodSchemas._generates_proof.implement(
    (container) => this.#restrictions[container].generates_proofs
  );

  // Returns whether an IP address is allowed for a container.
  #is_allowed_ip = Guardian.methodSchemas._is_allowed_ip.implement(
    (container, address) => {
      // Allow all IPs if there are no restrictions specified.
      if (!this.#restrictions[container].allowed_ips.length) return true;

      const isV4 = Address4.isValid(address);
      const addressBN = (
        isV4 ? new Address4(address) : new Address6(address)
      ).bigInt();

      let isAllowed =
        this.#restrictions[container].allowed_ips_cache.get(addressBN);

      // If this IP address has already been checked, return the cached result.
      if (isAllowed !== undefined) {
        return isAllowed;
      } else {
        isAllowed = !!this.#restrictions[container].allowed_ips.find(
          (ipNetwork) => {
            if ((isV4 && !ipNetwork.isV4) || (!isV4 && ipNetwork.isV4))
              throw new Error('IP version mismatch.');

            if (
              ipNetwork.startAddressBN <= addressBN &&
              addressBN <= ipNetwork.endAddressBN
            )
              return true;

            return false;
          }
        );

        this.#restrictions[container].allowed_ips_cache.set(
          addressBN,
          isAllowed
        );
      }

      return isAllowed;
    }
  );

  // Returns whether onchain address is allowed for container.
  #is_allowed_address = Guardian.methodSchemas._is_allowed_address.implement(
    (container, address, onchain) => {
      let restrictedAddresses;

      // Select address restrictions list based on message origination.
      if (onchain) {
        restrictedAddresses =
          ContainerRestrictionsSchema.shape.allowed_addresses.parse(
            this.#restrictions[container].allowed_addresses
          );
      } else {
        restrictedAddresses =
          ContainerRestrictionsSchema.shape.allowed_delegate_addresses.parse(
            this.#restrictions[container].allowed_delegate_addresses
          );
      }

      // Allow all addresses if there are no restrictions specified.
      if (!restrictedAddresses.length) return true;

      return !!restrictedAddresses.find(
        (allowedAddress) => allowedAddress === address.toLowerCase()
      );
    }
  );

  // Create error message for a given message id.
  #error = Guardian.methodSchemas._error.implement(
    (message, error, params) => new GuardianError(message, error, params)
  );

  // Filters off-chain job messages (off-chain creation and delivery).
  #process_offchain_message =
    Guardian.methodSchemas._process_offchain_message.implement((message) => {
      if (!message.containers.length)
        return this.#error(message, 'No containers specified', undefined);

      for (let i = 0; i < message.containers.length; i++) {
        const container = message.containers[i];

        // Filter out containers that are not supported.
        if (!this.#restrictions[container])
          return this.#error(message, 'Container not supported.', container);

        // Filter out containers that are not allowed for the IP.
        if (!this.#is_allowed_ip(container, message.ip))
          return this.#error(message, 'Container not allowed for address.', {
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
    });

  // Filters delegated Subscription messages (off-chain creation, on-chain delivery).
  #process_delegated_subscription_message =
    Guardian.methodSchemas._process_delegated_subscription_message.implement(
      (message) => {
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
            return this.#error(message, 'Container not supported', {
              container,
            });

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
        if (
          subscription.requires_proof &&
          !this.#generates_proof(lastContainer)
        )
          return this.#error(message, 'Container does not generate proof', {
            container: lastContainer,
          });

        return message;
      }
    );

  // Filters on-chain Coordinator subscription creation messages.
  #process_coordinator_created_message =
    Guardian.methodSchemas._process_coordinator_created_message.implement(
      (message) => {
        const { subscription } = message;

        if (subscription.completed)
          return this.#error(message, 'Subscription completed', undefined);

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
        if (
          subscription.requires_proof &&
          !this.#generates_proof(lastContainer)
        )
          return this.#error(message, 'Container does not generate proof', {
            container: lastContainer,
          });

        // Filter out subscriptions that don't match payment requirements.
        if (
          this.wallet_checker &&
          !this.wallet_checker.matches_payment_requirements(subscription)
        )
          return this.#error(message, 'Invalid payment', {
            subscription_id: subscription.id,
          });

        return message;
      }
    );

  // Routes messages to the appropriate filter method based on message type.
  process_message = Guardian.methodSchemas.process_message.implement(
    (message) => {
      let results;

      switch (message.type) {
        case MessageType.OffchainJob:
          results = this.#process_offchain_message(
            message as OffchainJobMessage
          );

          break;
        case MessageType.DelegatedSubscription:
          results = this.#process_delegated_subscription_message(
            message as DelegatedSubscriptionMessage
          );

          break;
        case MessageType.SubscriptionCreated:
          results = this.#process_coordinator_created_message(message);

          break;
        default:
          results = this.#error(message, 'Not supported', { raw: message });
      }

      return results;
    }
  );
}
