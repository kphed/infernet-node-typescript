import Docker from 'dockerode';

const DEFAULT_TIMEOUT_SECONDS = 60;

export default (username?: string, password?: string) =>
  new Docker({
    timeout: DEFAULT_TIMEOUT_SECONDS,
    ...(username && password ? { username, password } : {}),
  });
