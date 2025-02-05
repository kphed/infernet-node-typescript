// Reference: https://github.com/ritual-net/infernet-node/blob/7418dff0b55ba85c27b8764529f5e5f0aa9cbdb3/src/chain/container_lookup.py.
import { keccak256, encodeAbiParameters } from 'viem';
import { permutations } from '../utils/helpers';
import { InfernetContainer } from '../shared/config';

/**
 * Get all possible permutations of comma-separated container IDs. It performs this on
 * the power set of the containers List, which includes all possible combinations of
 * containers, including the empty set.
 */
export const getAllCommaSeparatedPermutations = (
  containers: string[]
): string[] => {
  let permutedElements: any = [];

  for (let i = 2; i <= containers.length; i++) {
    permutedElements = [
      ...permutedElements,
      ...permutations(containers, i).map((permutation) =>
        permutation.join(',')
      ),
    ];
  }

  return [...containers, ...permutedElements];
};

export class ContainerLookup {
  #container_lookup: {
    [key: string]: string[];
  } = {};

  constructor(configs: InfernetContainer[]) {
    this.#init_container_lookup(configs);
  }

  /**
   * Build a lookup table keccak hash of a container set -> container set.
   *
   * Since the containers field of a subscription is a keccak hash of the
   * comma-separated container IDs that it requires, we need to build a lookup
   * table of all possible container sets on the node side to find out which
   * containers are required for a given subscription.
   */
  #init_container_lookup(configs: InfernetContainer[]) {
    const allPermutations = getAllCommaSeparatedPermutations(
      configs.map(({ id }) => id)
    );
    const calculateHash = (permutation: string): string =>
      keccak256(
        encodeAbiParameters(
          [{ name: 'container', type: 'string' }],
          [permutation]
        )
      );

    // Compute hashes for each of the container ID permutations.
    this.#container_lookup = allPermutations.reduce((acc, val) => {
      return {
        ...acc,
        [calculateHash(val)]: val.split(','),
      };
    }, {});

    console.log(
      `Initialized container lookup: ${JSON.stringify(this.#container_lookup)}`
    );
  }

  /**
   * Get the container IDs from a keccak hash. Returns an empty List if the hash is
   * not found.
   */
  get_containers(hash: string): string[] {
    return this.#container_lookup[hash] ?? [];
  }
}
