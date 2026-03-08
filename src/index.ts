import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { handleAuth } from './authkit-callback-route.js';
import { AuthKitError, TokenRefreshError } from './errors.js';
import { authkit, authkitMiddleware, authkitProxy } from './middleware.js';
export {
  applyResponseHeaders,
  handleAuthkitHeaders,
  handleAuthkitProxy,
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
  AuthKitError,
  TokenRefreshError,
  authkit,
  authkitMiddleware,
  authkitProxy,
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
