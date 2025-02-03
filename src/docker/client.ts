import Docker from 'dockerode';

// 60 seconds.
const DEFAULT_TIMEOUT_SECONDS = 60_000;

export default (username?: string, password?: string): Docker =>
  new Docker({
    timeout: DEFAULT_TIMEOUT_SECONDS,
    ...(username && password ? { username, password } : {}),
  });
