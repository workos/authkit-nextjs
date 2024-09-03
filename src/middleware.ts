import { NextMiddleware } from 'next/server';
import { updateSession } from './session.js';
import { AuthkitMiddlewareOptions } from './interfaces.js';

export function authkitMiddleware({
  debug = false,
  middlewareAuth = { enabled: false, unauthenticatedPaths: [] },
  redirectUri = '',
}: AuthkitMiddlewareOptions = {}): NextMiddleware {
  return function (request) {
    return updateSession(request, debug, middlewareAuth, redirectUri);
  };
}
