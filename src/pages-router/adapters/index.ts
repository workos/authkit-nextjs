import { NextJSPagesAdapter } from './NextJSPagesAdapter.js';
import { createAuthKitFactory, configure, type AuthKitConfig } from '@workos-inc/authkit-ssr';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { AuthKitFactory, Session } from '../types.js';
import {
  WORKOS_CLIENT_ID,
  WORKOS_API_KEY,
  WORKOS_REDIRECT_URI,
  WORKOS_COOKIE_PASSWORD,
  WORKOS_COOKIE_NAME,
} from '../../env-variables.js';

export { NextJSPagesAdapter };

// Initialize authkit-ssr configuration from environment variables
if (!((globalThis as typeof globalThis & { __authkitSSRConfigured?: boolean }).__authkitSSRConfigured)) {
  configure({
    clientId: WORKOS_CLIENT_ID,
    apiKey: WORKOS_API_KEY,
    redirectUri: WORKOS_REDIRECT_URI,
    cookiePassword: WORKOS_COOKIE_PASSWORD,
    cookieName: WORKOS_COOKIE_NAME || 'wos-session',
  });
  (globalThis as typeof globalThis & { __authkitSSRConfigured?: boolean }).__authkitSSRConfigured = true;
}

/**
 * Factory function that creates a configured NextJS Pages adapter
 */
export function createPagesAdapter(): AuthKitFactory {
  const authKit = createAuthKitFactory<NextApiRequest, NextApiResponse>({
    sessionStorageFactory: (config) => {
      return new NextJSPagesAdapter(config);
    },
  });

  // Add compatibility methods for the old API
  return {
    ...authKit,
    // Legacy compatibility method
    async getSession(req: NextApiRequest) {
      const authResult = await authKit.withAuth(req);

      if (!authResult.user) {
        return null;
      }

      return {
        accessToken: authResult.accessToken || '',
        refreshToken: authResult.refreshToken || '',
        user: authResult.user,
        impersonator: authResult.impersonator,
        sessionId: authResult.sessionId,
        organizationId: authResult.claims?.org_id,
        role: authResult.claims?.role,
        permissions: authResult.claims?.permissions,
        entitlements: authResult.claims?.entitlements,
      };
    },
    // Legacy compatibility method for clearing sessions
    async deleteCookie(res: NextApiResponse) {
      const sessionStorage = new NextJSPagesAdapter();
      return sessionStorage.clearSession(res);
    },
  };
}

