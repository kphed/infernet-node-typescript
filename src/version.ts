// Reference: https://github.com/ritual-net/infernet-node/blob/f130d745ec8ed310e72fd8bba3fef87f67b76575/src/version.py.
const __version__ = '1.4.0';

export const checkNodeIsUpToDate = async () => {
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/ritual-net/infernet-node/main/src/version.py'
    );
    const version = (await response.text())
      .split('\n')[0]
      .match(/(?<=")[^"]*(?=")/);

    if (!version) {
      throw new Error('Latest version not found');
    } else if (version[0] !== __version__) {
      console.warn(
        `Your node version (v${__version__}) does not match with latest release (v${version[0]}). Consider updating your node.`
      );
    }
  } catch (err) {
    throw err;
  }
};
