import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { handleAuth } from './authkit-callback-route.js';
import { AuthKitError, TokenRefreshError } from './errors.js';
import { authkit, authkitMiddleware } from './middleware.js';
import { getTokenClaims, refreshSession, saveSession, withAuth } from './session.js';
import { validateApiKey } from './validate-api-key.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';

export {
  AuthKitError,
  TokenRefreshError,
  authkit,
  authkitMiddleware,
  getSignInUrl,
  getSignUpUrl,
  getWorkOS,
  handleAuth,
  refreshSession,
  saveSession,
  signOut,
  switchToOrganization,
  withAuth,
  getTokenClaims,
  validateApiKey,
};
