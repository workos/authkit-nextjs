/**
 * Headless AuthKit: Custom OAuth callback with saveSession.
 *
 * Verifies CSRF state, exchanges the code (with PKCE), and calls saveSession
 * to create a standard AuthKit session cookie. After this, withAuth/useAuth/
 * middleware all work as normal.
 */
import { getWorkOS, saveSession } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return new Response('Missing code or state parameter', { status: 400 });
  }

  const nextCookies = await cookies();
  const stored = nextCookies.get('custom-auth-state');

  if (!stored) {
    return new Response('Auth state cookie missing', { status: 400 });
  }

  const { codeVerifier, state: expectedState } = JSON.parse(stored.value);
  nextCookies.delete('custom-auth-state');

  if (state !== expectedState) {
    return new Response('OAuth state mismatch', { status: 400 });
  }

  const authResponse = await getWorkOS().userManagement.authenticateWithCode({
    clientId: process.env.WORKOS_CLIENT_ID!,
    code,
    codeVerifier,
  });

  await saveSession(authResponse, request);

  redirect('/');
}
