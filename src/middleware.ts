import { NextMiddleware, NextRequest } from 'next/server';
import { getSession, updateSessionMiddleware } from './session.js';
import { AuthkitMiddlewareOptions } from './interfaces.js';
import { WORKOS_REDIRECT_URI } from './env-variables.js';

export function authkitMiddleware({
  debug = false,
  middlewareAuth = { enabled: false, unauthenticatedPaths: [] },
  redirectUri = WORKOS_REDIRECT_URI,
  signUpPaths = [],
}: AuthkitMiddlewareOptions = {}): NextMiddleware {
  return function (request) {
    return updateSessionMiddleware(request, debug, middlewareAuth, redirectUri, signUpPaths);
  };
}

interface AuthKitOptions {
  debug?: boolean;
}

export async function authkit(request: NextRequest, options: AuthKitOptions = {}) {
  const session = await getSession();

  if (options.debug && !session) {
    console.log('No session found from cookie');
  }

  const response = {
    session,
    redirectUri: WORKOS_REDIRECT_URI,
  };

  return response;
}
