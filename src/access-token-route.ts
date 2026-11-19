import { refreshSession, withAuth } from './session.js';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * Route handlers that let `useAccessToken` get and refresh the access token
 * with `fetch` instead of a Server Action. A Server Action that sets a cookie
 * makes Next.js re-render the page and clear the client router cache; a Route
 * Handler doesn't.
 *
 * Mount them in a route covered by the AuthKit proxy/middleware and pass its
 * path to `AuthKitProvider` as `accessTokenEndpoint`:
 *
 * ```ts
 * // app/api/auth/access-token/route.ts
 * export const { GET, POST } = handleAccessToken();
 * ```
 */
export function handleAccessToken(): { GET: () => Promise<Response>; POST: () => Promise<Response> } {
  return {
    // Same as getAccessTokenAction.
    GET: async () => {
      const { accessToken } = await withAuth();
      return Response.json({ accessToken }, { headers: noStore });
    },
    // Same as refreshAccessTokenAction.
    POST: async () => {
      try {
        const { accessToken } = await refreshSession();
        return Response.json({ accessToken }, { headers: noStore });
      } catch (error) {
        console.warn('Failed to refresh access token:', error instanceof Error ? error.message : String(error));
        return Response.json(
          { accessToken: undefined, error: 'Failed to refresh access token' },
          { status: 500, headers: noStore },
        );
      }
    },
  };
}
