import { WorkOS } from '@workos-inc/node';
import { WORKOS_API_HOSTNAME, WORKOS_API_HTTPS, WORKOS_API_KEY, WORKOS_API_PORT } from './env-variables.js';


const options = {
  apiHostname: WORKOS_API_HOSTNAME,
  https: WORKOS_API_HTTPS ? WORKOS_API_HTTPS === 'true' : true,
  port: WORKOS_API_PORT ? parseInt(WORKOS_API_PORT) : undefined,
};

// Initialize the WorkOS client
const workos = new WorkOS(WORKOS_API_KEY, options);

export { workos };
