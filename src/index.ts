import { handleAuth } from './authkit-callback-route.js';
import { authkit, authkitMiddleware } from './middleware.js';
import { withAuth, refreshSession, encryptSession } from './session.js';
import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';

export {
  authkit,
  authkitMiddleware,
  encryptSession,
  getSignInUrl,
  getSignUpUrl,
  getWorkOS,
  handleAuth,
  refreshSession,
  signOut,
  switchToOrganization,
  withAuth,
};
