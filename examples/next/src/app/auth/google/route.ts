/**
 * Headless AuthKit: Direct provider sign-in with PKCE.
 *
 * Initiates OAuth with a specific provider (GoogleOAuth) instead of the AuthKit
 * hosted UI, while still using WorkOS session management via saveSession.
 */
import { getWorkOS } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const redirectUri = new URL('/auth/callback', process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!).toString();

export async function GET() {
  const workos = getWorkOS();
  const pkce = await workos.pkce.generate();
  const state = crypto.randomUUID();

  // Store PKCE verifier + CSRF state in an httpOnly cookie
  const nextCookies = await cookies();
  nextCookies.set('custom-auth-state', JSON.stringify({ codeVerifier: pkce.codeVerifier, state }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
  });

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'GoogleOAuth',
    clientId: process.env.WORKOS_CLIENT_ID!,
    redirectUri,
    state,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
  });

  redirect(authorizationUrl);
}
