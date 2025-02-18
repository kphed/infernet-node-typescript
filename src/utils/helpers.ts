export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export const getUnixTimestamp = (): number =>
  Math.floor(new Date().getTime() / 1_000);

export const add0x = (hash: string): `0x${string}` => {
  if (hash.substring(0, 2) === '0x') return hash as `0x${string}`;

  return `0x${hash}`;
};
