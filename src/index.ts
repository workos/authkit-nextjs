import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { handleAuth } from './authkit-callback-route.js';
import { handleGoogleOneTap } from './google-one-tap-route.js';
import { AuthKitError, CallbackError, TokenRefreshError } from './errors.js';
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
import { checkRecentAuth, getTokenClaims, refreshSession, saveSession, withAuth } from './session.js';
import { validateApiKey } from './validate-api-key.js';
import { getFeatureFlagsRuntimeClient } from './feature-flags.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';
export type { HandleGoogleOneTapOptions } from './google-one-tap-route.js';

export type { CallbackErrorCode, CallbackErrorContext } from './errors.js';

export {
  AuthKitError,
  CallbackError,
  TokenRefreshError,
  authkit,
  authkitMiddleware,
  authkitProxy,
  checkRecentAuth,
  getSignInUrl,
  getSignUpUrl,
  getFeatureFlagsRuntimeClient,
  getTokenClaims,
  getWorkOS,
  handleAuth,
  handleGoogleOneTap,
  refreshSession,
  saveSession,
  signOut,
  switchToOrganization,
  validateApiKey,
  withAuth,
};
