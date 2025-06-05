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
    const adapter = createPagesAdapter();
    
    // Get the session from the request
    const session = await adapter.getSession(req);
    
    // Attach auth to request
    (req as ApiRouteRequestWithAuth).auth = session;
    
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
  const adapter = createPagesAdapter();
  
  return adapter.getSession(req);
}