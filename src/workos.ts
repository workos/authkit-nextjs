import { WorkOS } from '@workos-inc/node';
import { WORKOS_API_HOSTNAME, WORKOS_API_KEY, WORKOS_API_HTTPS, WORKOS_API_PORT } from './env-variables.js';
import { lazy } from './utils.js';

export const VERSION = '2.6.0';

const options = {
  apiHostname: WORKOS_API_HOSTNAME,
  https: WORKOS_API_HTTPS ? WORKOS_API_HTTPS === 'true' : true,
  port: WORKOS_API_PORT ? parseInt(WORKOS_API_PORT) : undefined,
  appInfo: {
    name: 'authkit/nextjs',
    version: VERSION,
  },
};

/**
 * Create a WorkOS instance with the provided API key and options.
 * If an instance already exists, it returns the existing instance.
 * @returns The WorkOS instance.
 */
export const getWorkOS = lazy(() => new WorkOS(WORKOS_API_KEY, options));
