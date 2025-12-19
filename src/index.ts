import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { handleAuth } from './authkit-callback-route.js';
import { authkit, authkitMiddleware } from './middleware.js';
import {
  handleAuthkitHeaders,
  collectAuthkitHeaders,
  applyResponseHeaders,
  isAuthkitRequestHeader,
  AUTHKIT_REQUEST_HEADERS,
} from './middleware-helpers.js';
export type {
  AuthkitHeadersResult,
  AuthkitRequestHeader,
  CrossOriginRedirectPredicate,
  HandleAuthkitHeadersOptions,
  RedirectStatus,
} from './middleware-helpers.js';
import { getTokenClaims, refreshSession, saveSession, withAuth } from './session.js';
import { validateApiKey } from './validate-api-key.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';

export {
  applyResponseHeaders,
  authkit,
  authkitMiddleware,
  AUTHKIT_REQUEST_HEADERS,
  collectAuthkitHeaders,
  getSignInUrl,
  getSignUpUrl,
  getTokenClaims,
  getWorkOS,
  handleAuth,
  handleAuthkitHeaders,
  isAuthkitRequestHeader,
  refreshSession,
  saveSession,
  signOut,
  switchToOrganization,
  validateApiKey,
  withAuth,
};
