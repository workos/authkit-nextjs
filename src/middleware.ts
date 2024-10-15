import { NextMiddleware } from 'next/server';
import { updateSession } from './session.js';
import { AuthkitMiddlewareOptions } from './interfaces.js';
import { WORKOS_REDIRECT_URI } from './env-variables.js';

export function authkitMiddleware({
  debug = false,
  middlewareAuth = { enabled: false, unauthenticatedPaths: [] },
  redirectUri = WORKOS_REDIRECT_URI,
}: AuthkitMiddlewareOptions = {}): NextMiddleware {
  return function (request) {
    return updateSession(request, debug, middlewareAuth, redirectUri);
  };
}
