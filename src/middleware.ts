import { NextMiddleware, NextRequest } from 'next/server';
import { updateSessionMiddleware, updateSession } from './session.js';
import { AuthkitMiddlewareOptions, AuthkitOptions, AuthkitResponse } from './interfaces.js';
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

export async function authkit(request: NextRequest, options: AuthkitOptions = {}): Promise<AuthkitResponse> {
  return await updateSession(request, options);
}
