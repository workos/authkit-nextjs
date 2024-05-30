import { WORKOS_REDIRECT_URI, WORKOS_COOKIE_MAX_AGE } from './env-variables.js';

const redirectUrl = new URL(WORKOS_REDIRECT_URI);
const isSecureProtocol = redirectUrl.protocol === 'https:';

const cookieName = 'wos-session';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: isSecureProtocol,
  sameSite: 'lax' as const,
  // Defaults to 31 days
  maxAge: WORKOS_COOKIE_MAX_AGE ? parseInt(WORKOS_COOKIE_MAX_AGE, 10) : 60 * 60 * 24 * 31,
};

export { cookieName, cookieOptions };
