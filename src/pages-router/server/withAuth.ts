import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult, NextApiRequest } from 'next';
import { createPagesAdapter } from '../adapters/index.js';
import type { GetServerSidePropsContextWithAuth, WithAuthOptions } from '../types.js';
import { getAuthorizationUrl } from '../../get-authorization-url.js';

/**
 * Higher-order function that wraps getServerSideProps to automatically inject auth state
 * @param handler The getServerSideProps function to wrap
 * @param options Configuration options
 */
export function withAuth<
  P extends Record<string, unknown> = Record<string, unknown>,
  Q extends Record<string, string> = Record<string, string>,
>(
  handler: (context: GetServerSidePropsContextWithAuth<Q>) => GetServerSidePropsResult<P> | Promise<GetServerSidePropsResult<P>>,
  options: WithAuthOptions = {}
): GetServerSideProps<P, Q> {
  return async (context: GetServerSidePropsContext<Q>) => {
    const adapter = createPagesAdapter();
    
    // Get the session from the request - context.req has cookies property needed
    const session = await adapter.getSession(context.req as NextApiRequest);
    
    // If ensureSignedIn is true and there's no session, redirect to sign in
    if (options.ensureSignedIn && !session) {
      const returnToPath = options.returnToPath || context.resolvedUrl;
      const signInUrl = await getAuthorizationUrl({
        screenHint: 'sign-in',
        returnPathname: returnToPath,
      });
      
      return {
        redirect: {
          destination: signInUrl,
          permanent: false,
        },
      };
    }
    
    // Create context with auth - safely cast the context
    const contextWithAuth = {
      ...context,
      req: context.req as NextApiRequest,
      auth: session,
    } as GetServerSidePropsContextWithAuth<Q>;
    
    // Call the wrapped handler
    return handler(contextWithAuth);
  };
}