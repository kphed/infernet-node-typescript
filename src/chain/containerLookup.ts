// Reference: https://github.com/ritual-net/infernet-node/blob/0e2d8cff1a42772a4ea4bea9cd33e99f60d46a0f/src/chain/containerLookup.py.
import { z } from 'zod';
import { keccak256, encodeAbiParameters } from 'viem';
import { HexSchema } from '../shared/schemas';

const GetAllCommaSeparatedPermutationsSchema = z
  .function()
  .args(z.string().array())
  .returns(z.string().array());

const ComputePermutationHashSchema = z
  .function()
  .args(z.string())
  .returns(HexSchema);

// Generate container ID permutations (comma-separated). E.g. ['hello', 'world', 'hello,world', 'world,hello'].
export const getAllCommaSeparatedPermutations: z.infer<
  typeof GetAllCommaSeparatedPermutationsSchema
> = (containers) => {
  // Based on: https://docs.python.org/3/library/itertools.html#itertools.permutations.
  const permutations = <T>(
    iterable: T[] | string,
    len: number = iterable.length
  ): T[][] => {
    // If `len` is greater than the number of items, return an empty array immediately.
    if (len > iterable.length) return [];

    const items =
      typeof iterable === 'string'
        ? (iterable.split('') as any as T[])
        : iterable;
    const results: T[][] = [];

    const createPermutation = (current: T[], remaining: T[]): void => {
      if (current.length === len) {
        results.push(current);

        return;
      }

      for (let i = 0; i < remaining.length; i++) {
        const newRemaining = remaining
          .slice(0, i)
          .concat(remaining.slice(i + 1));

        createPermutation([...current, remaining[i]], newRemaining);
      }
    };

    createPermutation([], items);

    return results;
  };
  let permutedElements: string[] = [];

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

// ABI-encode and hash a container ID permutation.
export const computePermutationHash: z.infer<
  typeof ComputePermutationHashSchema
> = (permutation) =>
  keccak256(encodeAbiParameters([{ type: 'string' }], [permutation]));

export class ContainerLookup {
  static fieldSchemas = {
    _containerLookup: z.record(z.string().array()),
  };

  static methodSchemas = {
    get_containers: {
      args: {
        hash: z.string(),
      },
      returns: z.string().array(),
    },
  };

  #containerLookup: z.infer<
    typeof ContainerLookup.fieldSchemas._containerLookup
  >;

  constructor(configs) {
    const permutations: string[] = getAllCommaSeparatedPermutations(
      configs.map(({ id }) => id)
    );

    this.#containerLookup = ContainerLookup.fieldSchemas._containerLookup.parse(
      permutations.reduce(
        (acc, permutation) => ({
          ...acc,
          // E.g. computePermutationHash('hello,world'): ['hello', 'world'].
          [computePermutationHash(permutation)]: permutation.split(','),
        }),
        {}
      )
    );

    console.log(
      `Initialized container lookup: ${JSON.stringify(this.#containerLookup)}`
    );
  }

  // Look up a set of containers by their hash.
  get_containers(
    hash: z.infer<typeof ContainerLookup.methodSchemas.get_containers.args.hash>
  ): z.infer<typeof ContainerLookup.methodSchemas.get_containers.returns> {
    return ContainerLookup.methodSchemas.get_containers.returns.parse(
      this.#containerLookup[hash] ?? []
    );
  }
}
