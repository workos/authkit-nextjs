import { WorkOS } from '@workos-inc/node';
import { variables } from './env-variables.js';

export const VERSION = '0.9.0';

const options = {
  apiHostname: variables.WORKOS_API_HOSTNAME,
  https: variables.WORKOS_API_HTTPS ? variables.WORKOS_API_HTTPS === 'true' : true,
  port: variables.WORKOS_API_PORT ? parseInt(variables.WORKOS_API_PORT) : undefined,
  appInfo: {
    name: 'authkit/nextjs',
    version: VERSION,
  },
};

// Initialize the WorkOS client
const workos = new WorkOS(variables.WORKOS_API_KEY, options);

export { workos };
