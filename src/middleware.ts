import { NextMiddleware } from 'next/server';
import { updateSession } from './session.js';

interface AuthkitMiddlewareOptions {
  debug?: boolean;
}

export function authkitMiddleware({ debug = false }: AuthkitMiddlewareOptions = {}): NextMiddleware {
  return function (request) {
    return updateSession(request, debug);
  };
}
