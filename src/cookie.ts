import { WORKOS_REDIRECT_URI } from './env-variables.js';

const redirectUrl = new URL(WORKOS_REDIRECT_URI);
const isSecureProtocol = redirectUrl.protocol === 'https:';

const cookieName = 'wos-session';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: isSecureProtocol,
  sameSite: 'lax' as const,
  maxAge: 600,
};

export { cookieName, cookieOptions };
