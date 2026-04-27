import { authkitProxy } from '@workos-inc/authkit-nextjs';

export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/sign-in', '/sign-up', '/auth/callback', '/callback'],
  },
});

// Match app and API routes while excluding static assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
