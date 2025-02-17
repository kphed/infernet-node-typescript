// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/orchestration/guardian.py.
import ipaddr, { IPv4, IPv6 } from 'ipaddr.js';
import { ContainerLookup, Wallet } from '../chain';
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

export interface ContainerRestrictions {
  allowed_ips: [IPv4 | IPv6, number][];
  allowed_addresses: string[];
  allowed_delegate_addresses: string[];
  external: boolean;
  generates_proofs: boolean;
}

export class Guardian {
  #chain_enabled: boolean;
  #container_lookup: ContainerLookup;
  #wallet_checker?: WalletChecker;
  #restrictions: {
    [key: string]: ContainerRestrictions;
  };

  constructor(
    configs: InfernetContainer[],
    chain_enabled: boolean,
    container_lookup: ContainerLookup,
    wallet_checker?: WalletChecker
  ) {
    this.#chain_enabled = chain_enabled;
    this.#container_lookup = container_lookup;
    this.#wallet_checker = wallet_checker;

    this.#restrictions = configs.reduce(
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
          allowed_ips: allowed_ips.map((ip) =>
            // Returns an object representing the IP address, or throws an `Error` if the
            // passed string is not a valid representation of an IP address.
            ipaddr.parseCIDR(ip)
          ),
          allowed_addresses: allowed_addresses.map((address) =>
            address.toLowerCase()
          ),
          allowed_delegate_addresses: allowed_delegate_addresses.map(
            (address) => address.toLowerCase()
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
    );

    console.debug('Initialized Guardian');
  }
}
