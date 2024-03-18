const cookieName = 'wos-session';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
};

export { cookieName, cookieOptions };
