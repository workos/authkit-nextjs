import { handleAuth } from './authkit-callback-route.js';
import { authkit, authkitMiddleware } from './middleware.js';
import { withAuth, refreshSession } from './session.js';
import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import { getWorkOS } from './workos.js';

export * from './interfaces.js';

export {
  getWorkOS,
  handleAuth,
  //
  authkitMiddleware,
  authkit,
  //
  getSignInUrl,
  getSignUpUrl,
  withAuth,
  refreshSession,
  signOut,
  switchToOrganization,
};
