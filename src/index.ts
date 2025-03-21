import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { handleAuth } from './authkit-callback-route.js';
import { authkit, authkitMiddleware } from './middleware.js';
import { refreshSession, saveSession, withAuth } from './session.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';

export {
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
};
