import type { FeatureFlagsRuntimeClient, RuntimeClientOptions } from '@workos-inc/node';
import { lazy } from './utils.js';
import { getWorkOS } from './workos.js';

/**
 * Returns a shared WorkOS Feature Flags runtime client.
 *
 * The runtime client keeps feature flag state in sync in the background, so it
 * should be created once per server process instead of once per request.
 * Options are only used when the client is created for the first time.
 */
export const getFeatureFlagsRuntimeClient = lazy(
  (options?: RuntimeClientOptions): FeatureFlagsRuntimeClient => getWorkOS().featureFlags.createRuntimeClient(options),
);
