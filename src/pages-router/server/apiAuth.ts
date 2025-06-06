import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { createPagesAdapter } from '../adapters/index.js';
import type { ApiRouteRequestWithAuth, Session } from '../types.js';

/**
 * Wraps an API route handler to automatically inject auth state
 * @param handler The API route handler to wrap
 * @returns Wrapped API handler with auth injected
 */
export function withApiAuth(
  handler: (req: ApiRouteRequestWithAuth, res: NextApiResponse) => void | Promise<void>
): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const authKit = createPagesAdapter();
    
    // Get the auth result from the request
    const authResult = await authKit.withAuth(req);
    
    // Create auth object compatible with existing API
    const auth = authResult.user ? {
      accessToken: authResult.accessToken || '',
      refreshToken: authResult.refreshToken || '',
      user: authResult.user,
      impersonator: authResult.impersonator,
      sessionId: authResult.sessionId,
      organizationId: authResult.claims?.org_id,
      role: authResult.claims?.role,
      permissions: authResult.claims?.permissions,
      entitlements: authResult.claims?.entitlements,
    } : null;
    
    // Attach auth to request
    (req as ApiRouteRequestWithAuth).auth = auth;
    
    // Call the wrapped handler
    return handler(req as ApiRouteRequestWithAuth, res);
  };
}

/**
 * Get auth from an API route request
 * Can be used directly in API routes without the wrapper
 * @param req The API request
 * @returns The session or null
 */
export async function getAuth(req: NextApiRequest): Promise<Session | null> {
  const authKit = createPagesAdapter();
  
  const authResult = await authKit.withAuth(req);
  
  // Return null if no user
  if (!authResult.user) {
    return null;
  }
  
  // Create session object compatible with existing API
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
}