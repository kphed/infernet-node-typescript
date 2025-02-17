// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/chain/container_lookup.py.
import { keccak256, encodeAbiParameters, Hex } from 'viem';
import { permutations } from '../utils/helpers';
import { InfernetContainer } from '../shared/config';

/**
 * Get all possible permutations of comma-separated container IDs. It performs this on
 * the containers array, which includes all possible combinations of containers.
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
  #init_container_lookup(configs: InfernetContainer[]): void {
    const allPermutations = getAllCommaSeparatedPermutations(
      configs.map(({ id }) => id)
    );
    const calculateHash = (permutation: string): Hex =>
      keccak256(encodeAbiParameters([{ type: 'string' }], [permutation]));

    // Compute hashes for each of the container ID permutations.
    this.#container_lookup = allPermutations.reduce(
      (acc, val) => ({
        ...acc,
        [calculateHash(val)]: val.split(','),
      }),
      {}
    );

    console.log(
      `Initialized container lookup: ${JSON.stringify(this.#container_lookup)}`
    );
  }

  /**
   * Get the container IDs from a keccak hash. Returns an empty array if the hash is not found.
   */
  get_containers(hash: string): string[] {
    return this.#container_lookup[hash] ?? [];
  }
}
