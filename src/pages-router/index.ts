import { createPagesAdapter } from './adapters/index.js';
import { parseAccessToken } from './config.js';
import { WORKOS_CLIENT_ID } from '../env-variables.js';
import { getWorkOS } from '../workos.js';
import { getAuthorizationUrl } from '../get-authorization-url.js';
import type { NextApiRequest, NextApiResponse } from 'next';

// Re-export components
export * from './components/index.js';

// Re-export server helpers
export * from './server/index.js';

// Re-export types
export * from './types.js';

// Re-export getWorkOS from main package
export { getWorkOS };

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
  const adapter = createPagesAdapter();
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { code, state, error } = req.query;
  
  if (error || !code) {
    const returnTo = state ? JSON.parse(state as string).returnTo : '/';
    res.redirect(returnTo);
    return;
  }

  try {
    // Exchange code for tokens
    const result = await getWorkOS().userManagement.authenticateWithCode({
      clientId: WORKOS_CLIENT_ID,
      code: code as string,
    });

    // Save session using adapter
    await adapter.saveSession(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      impersonator: result.impersonator,
    });

    // Redirect to return path or home
    const returnTo = state ? JSON.parse(state as string).returnTo : '/';
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
  const adapter = createPagesAdapter();
  
  // Get current session to get sessionId
  const session = await adapter.getSession(req);
  
  // Clear the session cookie
  await adapter.deleteCookie(res);
  
  // Parse access token to get sessionId
  const sessionData = session ? parseAccessToken(session.accessToken) : null;
  
  if (sessionData?.sessionId) {
    // Get logout URL from WorkOS
    const logoutUrl = getWorkOS().userManagement.getLogoutUrl({ 
      sessionId: sessionData.sessionId, 
      returnTo: returnTo || '/' 
    });
    return logoutUrl;
  }
  
  return returnTo || '/';
}

/**
 * Switch organization for Pages Router
 */
export async function switchToOrganization(
  req: NextApiRequest,
  res: NextApiResponse,
  organizationId: string
) {
  const adapter = createPagesAdapter();
  
  const session = await adapter.getSession(req);
  if (!session) {
    throw new Error('No active session');
  }

  try {
    // Refresh with new organization
    const refreshResult = await getWorkOS().userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: session.refreshToken,
      organizationId,
    });

    // Save updated session
    await adapter.saveSession(res, {
      accessToken: refreshResult.accessToken,
      refreshToken: refreshResult.refreshToken,
      user: refreshResult.user,
      impersonator: refreshResult.impersonator,
    });

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
) {
  const adapter = createPagesAdapter();
  
  const session = await adapter.getSession(req);
  if (!session) {
    throw new Error('No active session');
  }

  try {
    const refreshResult = await getWorkOS().userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: session.refreshToken,
      organizationId: options?.organizationId,
    });

    // Save updated session
    await adapter.saveSession(res, {
      accessToken: refreshResult.accessToken,
      refreshToken: refreshResult.refreshToken,
      user: refreshResult.user,
      impersonator: refreshResult.impersonator,
    });

    return refreshResult;
  } catch (error) {
    throw new Error(`Failed to refresh session: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get token claims for Pages Router
 */
export async function getTokenClaims(req: NextApiRequest) {
  const adapter = createPagesAdapter();
  
  const session = await adapter.getSession(req);
  if (!session) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(session.accessToken.split('.')[1]));
    return payload;
  } catch {
    return null;
  }
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