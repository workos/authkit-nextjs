import { WorkOS } from '@workos-inc/node';
import {
  WORKOS_API_HOSTNAME,
  WORKOS_API_HTTPS,
  WORKOS_API_KEY,
  WORKOS_API_PORT,
  WORKOS_CLIENT_ID,
} from './env-variables.js';
import { lazy } from './utils.js';

export const VERSION = '2.14.0';

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
 * Returns the shared WorkOS client used by AuthKit.
 *
 * With `WORKOS_API_KEY` set this is a confidential client. Without it (unset or
 * empty) it is a PKCE public client: sign-in, callback, session refresh and
 * sign-out work, but WorkOS management APIs (e.g. `getWorkOS().organizations`,
 * `getWorkOS().userManagement.getUser`) require an API key and throw an
 * `ApiKeyRequiredException`.
 *
 * The WorkOS SDK also falls back to `process.env.WORKOS_API_KEY`, the same
 * variable read here, so a non-empty key in the environment always wins.
 */
export const getWorkOS = lazy(() => new WorkOS({ apiKey: WORKOS_API_KEY, clientId: WORKOS_CLIENT_ID, ...options }));

/**
 * Returns the WorkOS client for a feature that needs an API key, or throws an
 * actionable error before any network call in public-client (keyless) mode.
 */
export function getWorkOSWithApiKey(feature: string): WorkOS {
  const workos = getWorkOS();
  // The client's effective key, including the SDK's own env fallback.
  if (!workos.key) {
    throw new Error(
      `${feature} requires a WorkOS API key; set WORKOS_API_KEY. Public-client (keyless) mode supports sign-in only.`,
    );
  }
  return workos;
}
