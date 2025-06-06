import { createPagesAdapter, NextJSPagesAdapter } from './adapters/index.js';
import { WORKOS_CLIENT_ID } from '../env-variables.js';
import { getWorkOS as authKitGetWorkOS } from '@workos-inc/authkit-ssr';
import { getAuthorizationUrl } from './get-authorization-url.js';
import type { NextApiRequest, NextApiResponse } from 'next';

// Re-export components
export * from './components/index.js';

// Re-export server helpers
export * from './server/index.js';

// Re-export types
export * from './types.js';

// Re-export getWorkOS function from authkit-ssr
export { getWorkOS as authKitGetWorkOS } from '@workos-inc/authkit-ssr';

// Legacy compatibility export
export const getWorkOS: () => any = authKitGetWorkOS;

// Re-export adapter factory
export { createPagesAdapter };

/**
 * Get sign-in URL for Pages Router
 */
export async function getSignInUrl({
  organizationId,
  loginHint,
  redirectUri,
}: { organizationId?: string; loginHint?: string; redirectUri?: string } = {}) {
  return getAuthorizationUrl({
    screenHint: 'sign-in',
    organizationId,
    loginHint,
    redirectUri,
  });
}

/**
 * Get sign-up URL for Pages Router
 */
export async function getSignUpUrl({
  organizationId,
  loginHint,
  redirectUri,
}: { organizationId?: string; loginHint?: string; redirectUri?: string } = {}) {
  return getAuthorizationUrl({
    screenHint: 'sign-up',
    organizationId,
    loginHint,
    redirectUri,
  });
}

/**
 * Handle auth callback for Pages Router
 * This should be used in /api/auth/callback
 */
export async function handleAuth(req: NextApiRequest, res: NextApiResponse) {
  const authKit = createPagesAdapter();
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { code, state, error } = req.query;
  
  if (error || !code) {
    const returnTo = state ? JSON.parse(state as string).returnPathname : '/';
    res.redirect(returnTo);
    return;
  }

  try {
    // Exchange code for tokens
    const result = await authKitGetWorkOS().userManagement.authenticateWithCode({
      clientId: WORKOS_CLIENT_ID,
      code: code as string,
      session: {
        sealSession: true,
        cookiePassword: undefined, // Uses default from config
      },
    });

    // Create session from authentication response
    if (result.sealedSession) {
      await authKit.saveSession(res, result.sealedSession);
    } else {
      throw new Error('No sealed session returned from authentication');
    }

    // Redirect to return path or home
    const returnTo = state ? JSON.parse(state as string).returnPathname : '/';
    res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to authenticate with code:', error);
    res.redirect('/');
  }
}

/**
 * Sign out for Pages Router
 * This should be called from an API route
 */
export async function signOut(req: NextApiRequest, res: NextApiResponse, { returnTo }: { returnTo?: string } = {}) {
  const authKit = createPagesAdapter();
  
  // Get current session
  const authResult = await authKit.withAuth(req);
  
  if (authResult.refreshToken && authResult.user) {
    // Create a minimal session object for logout
    const session = {
      accessToken: authResult.accessToken || '',
      refreshToken: authResult.refreshToken,
      user: authResult.user,
      impersonator: authResult.impersonator,
    };
    
    // Get logout URL and clear session
    const { logoutUrl } = await authKit.getLogoutUrl(session, res, { returnTo });
    return logoutUrl;
  }
  
  // Just clear the session if no valid session
  const sessionStorage = new NextJSPagesAdapter();
  await sessionStorage.clearSession(res);
  return returnTo || '/';
}

/**
 * Switch organization for Pages Router
 */
export async function switchToOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string
): Promise<{ user: any; organizationId: string }> {
  const authKit = createPagesAdapter();
  
  const authResult = await authKit.withAuth(req);
  if (!authResult.refreshToken) {
    throw new Error('No active session');
  }

  try {
    // Refresh with new organization
    const refreshResult = await authKitGetWorkOS().userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: authResult.refreshToken,
      organizationId,
      session: {
        sealSession: true,
        cookiePassword: undefined, // Uses default from config
      },
    });

    // Save updated session
    if (refreshResult.sealedSession) {
      await authKit.saveSession(res, refreshResult.sealedSession);
    } else {
      throw new Error('No sealed session returned from refresh');
    }

    return {
      user: refreshResult.user,
      organizationId,
    };
  } catch (error) {
    throw new Error(`Failed to switch organization: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Refresh session for Pages Router
 */
export async function refreshSession(
  req: NextApiRequest,
  res: NextApiResponse,
  options?: { organizationId?: string }
): Promise<any> {
  const authKit = createPagesAdapter();
  
  const authResult = await authKit.withAuth(req);
  if (!authResult.refreshToken || !authResult.user) {
    throw new Error('No active session');
  }

  try {
    // Create session object for refresh
    const session = {
      accessToken: authResult.accessToken || '',
      refreshToken: authResult.refreshToken,
      user: authResult.user,
      impersonator: authResult.impersonator,
    };
    
    const refreshResult = await authKit.refreshSession(session);
    
    // Save the sealed session data
    await authKit.saveSession(res, refreshResult.sessionData);

    return {
      user: refreshResult.user,
      organizationId: refreshResult.organizationId,
      accessToken: refreshResult.accessToken,
      refreshToken: session.refreshToken, // Keep original refresh token
      impersonator: refreshResult.imposionator,
      authenticationMethod: undefined,
      sealedSession: refreshResult.sessionData,
    };
  } catch (error) {
    throw new Error(`Failed to refresh session: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get token claims for Pages Router
 */
export async function getTokenClaims(req: NextApiRequest) {
  const authKit = createPagesAdapter();
  
  const authResult = await authKit.withAuth(req);
  return authResult.claims || null;
}

// For middleware compatibility - Pages Router doesn't use middleware auth
export function authkitMiddleware() {
  throw new Error('authkitMiddleware is not supported in Pages Router. Use withAuth() or getAuth() in your pages and API routes instead.');
}

export function authkit() {
  throw new Error('authkit() is not supported in Pages Router. Use withAuth() or getAuth() in your pages and API routes instead.');
}

// saveSession is internal and handled by the adapter
export async function saveSession() {
  throw new Error('saveSession is handled internally in Pages Router. Use the auth helpers instead.');
}