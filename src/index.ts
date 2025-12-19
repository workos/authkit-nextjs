import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { handleAuth } from './authkit-callback-route.js';
import { authkit, authkitMiddleware } from './middleware.js';
export {
  applyResponseHeaders,
  handleAuthkitHeaders,
  partitionAuthkitHeaders,
  isAuthkitRequestHeader,
  AUTHKIT_REQUEST_HEADERS,
  type AuthkitHeadersResult,
  type AuthkitRedirectStatus,
  type AuthkitRequestHeader,
  type HandleAuthkitHeadersOptions,
} from './middleware-helpers.js';
import { getTokenClaims, refreshSession, saveSession, withAuth } from './session.js';
import { validateApiKey } from './validate-api-key.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';

export {
  authkit,
  authkitMiddleware,
  getSignInUrl,
  getSignUpUrl,
  getTokenClaims,
  getWorkOS,
  handleAuth,
  refreshSession,
  saveSession,
  signOut,
  switchToOrganization,
  validateApiKey,
  withAuth,
};
