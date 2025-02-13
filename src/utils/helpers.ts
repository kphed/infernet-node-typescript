export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Generates permutations of length `r` for `iterable`.
 * Reference: https://docs.python.org/3/library/itertools.html#itertools.permutations.
 */
export const permutations = <T>(
  iterable: T[] | string,
  r: number = iterable.length
): T[][] => {
  // If r is greater than the number of items, return an empty array immediately.
  if (r > iterable.length) return [];

  const items =
    typeof iterable === 'string'
      ? (iterable.split('') as any as T[])
      : iterable;
  const results: T[][] = [];

  const createPermutation = (current: T[], remaining: T[]): void => {
    if (current.length === r) {
      results.push(current);

      return;
    }

    for (let i = 0; i < remaining.length; i++) {
      const newRemaining = remaining.slice(0, i).concat(remaining.slice(i + 1));

      createPermutation([...current, remaining[i]], newRemaining);
    }
  };

  createPermutation([], items);

  return results;
};

/**
 * Creates a new object or array from the input.
 *
 * NOTE: Properties with function-type values will be omitted.
 */
export const cloneDeepJSON = (obj: any) => JSON.parse(JSON.stringify(obj));
