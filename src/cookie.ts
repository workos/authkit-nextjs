import { WORKOS_REDIRECT_URI, WORKOS_COOKIE_MAX_AGE } from './env-variables.js';

const redirectUrl = new URL(WORKOS_REDIRECT_URI);
const isSecureProtocol = redirectUrl.protocol === 'https:';

const cookieName = 'wos-session';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: isSecureProtocol,
  sameSite: 'lax' as const,
  maxAge: parseInt(WORKOS_COOKIE_MAX_AGE ?? '600', 10),
};

export { cookieName, cookieOptions };
