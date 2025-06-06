import { NextJSPagesAdapter } from './NextJSPagesAdapter.js';
import { createAuthKitFactory, configure, type AuthKitConfig } from '@workos-inc/authkit-ssr';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WORKOS_CLIENT_ID, WORKOS_API_KEY, WORKOS_REDIRECT_URI, WORKOS_COOKIE_PASSWORD } from '../../env-variables.js';

export { NextJSPagesAdapter };

// Initialize authkit-ssr configuration from environment variables
if (!(globalThis as any).__authkitSSRConfigured) {
  configure({
    clientId: WORKOS_CLIENT_ID,
    apiKey: WORKOS_API_KEY,
    redirectUri: WORKOS_REDIRECT_URI,
    cookiePassword: WORKOS_COOKIE_PASSWORD,
  });
  (globalThis as any).__authkitSSRConfigured = true;
}

/**
 * Factory function that creates a configured NextJS Pages adapter
 */
export function createPagesAdapter(): any {
  return createAuthKitFactory<NextApiRequest, NextApiResponse>({
    sessionStorageFactory: (config) => new NextJSPagesAdapter(config),
  });
}