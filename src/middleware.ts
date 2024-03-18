import { NextMiddleware } from 'next/server';
import { updateSession } from './session.js';

export function authkitMiddleware(): NextMiddleware {
  return function (request) {
    return updateSession(request);
  };
}
