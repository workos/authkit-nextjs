import type { AuthenticationResponse } from '@workos-inc/node';
import { NextRequest } from 'next/server';
import { WORKOS_CLIENT_ID } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import type { HandleGoogleOneTapOptions } from './interfaces.js';
import { appendPKCESetCookieHeader } from './pkce.js';
import { saveSession } from './session.js';
import { setCachePreventionHeaders } from './utils.js';
import { getWorkOS } from './workos.js';

const nodeSdkVersionError = '@workos-inc/node 10.12 or newer is required for Google One Tap.';

class UnsupportedNodeSdkError extends Error {}

type AuthenticateWithGoogleIdToken = (options: {
  clientId: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
}) => Promise<AuthenticationResponse>;

const authenticate = async (request: NextRequest, token: string): Promise<AuthenticationResponse> => {
  const userManagement = getWorkOS().userManagement;
  const authenticateWithGoogleIdToken = (
    userManagement as typeof userManagement & {
      authenticateWithGoogleIdToken?: AuthenticateWithGoogleIdToken;
    }
  ).authenticateWithGoogleIdToken;

  if (typeof authenticateWithGoogleIdToken !== 'function') {
    throw new UnsupportedNodeSdkError(nodeSdkVersionError);
  }

  return authenticateWithGoogleIdToken.call(userManagement, {
    clientId: WORKOS_CLIENT_ID,
    token,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });
};

export function handleGoogleOneTap(options: HandleGoogleOneTapOptions = {}) {
  const { returnPathname = '/', baseURL, onError, onSuccess } = options;

  if (baseURL) {
    try {
      new URL(baseURL);
    } catch (error) {
      throw new Error(`Invalid baseURL: ${baseURL}`, { cause: error });
    }
  }

  return async function POST(request: NextRequest): Promise<Response> {
    let authenticationResponse: AuthenticationResponse;

    try {
      const formData = await request.formData();
      const token = formData.get('credential');
      const bodyCsrfToken = formData.get('g_csrf_token');
      const cookieCsrfToken = request.cookies.get('g_csrf_token')?.value;

      if (
        typeof token !== 'string' ||
        typeof bodyCsrfToken !== 'string' ||
        !cookieCsrfToken ||
        bodyCsrfToken !== cookieCsrfToken
      ) {
        return noStore(new Response('Invalid Google One Tap request.', { status: 400 }));
      }

      authenticationResponse = await authenticate(request, token);
      await saveSession(authenticationResponse, request);
    } catch (error) {
      console.error('[AuthKit Google One Tap error]', error);

      if (onError) {
        return noStore(await onError({ error, request }));
      }

      if (error instanceof UnsupportedNodeSdkError) {
        throw error;
      }

      const { url, sealedState } = await getAuthorizationUrl({ returnPathname });
      const response = noStore(redirectAfterPost(url));
      appendPKCESetCookieHeader(request, response.headers, sealedState);
      return response;
    }

    await onSuccess?.(authenticationResponse);

    const redirectUrl = baseURL ? new URL(baseURL) : new URL(request.url);
    const parsedReturnUrl = new URL(returnPathname, 'https://placeholder.com');
    redirectUrl.pathname = parsedReturnUrl.pathname;
    redirectUrl.search = parsedReturnUrl.search;
    return noStore(redirectAfterPost(redirectUrl.toString()));
  };
}

function redirectAfterPost(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

function noStore(response: Response): Response {
  response.headers.set('Vary', 'Cookie');
  setCachePreventionHeaders(response.headers);
  return response;
}
