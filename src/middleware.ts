import { NextMiddleware } from 'next/server';
import { updateSession } from './session.js';
import { AuthkitMiddlewareOptions } from './interfaces.js';
import { variables } from './env-variables.js';

export function authkitMiddleware({
  debug = false,
  middlewareAuth = { enabled: false, unauthenticatedPaths: [] },
  options = {},
}: AuthkitMiddlewareOptions = {}): NextMiddleware {
  return function (request) {
    if (options) {
      variables.setUserProvidedOptions(options);
    }

    return updateSession(request, debug, middlewareAuth);
  };
}
