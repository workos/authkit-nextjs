import type { AuthenticationResponse } from '@workos-inc/node';
import { NextRequest } from 'next/server';
import { WORKOS_CLIENT_ID } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { saveSession } from './session.js';
import { redirectWithFallback, setCachePreventionHeaders } from './utils.js';
import { getWorkOS } from './workos.js';

export interface HandleGoogleOneTapOptions {
  returnPathname?: string;
  onError?: (params: { error?: unknown; request: NextRequest }) => Response | Promise<Response>;
  onSuccess?: (data: Awaited<ReturnType<typeof authenticate>>) => void | Promise<void>;
}

const authenticate = async (request: NextRequest, token: string): Promise<AuthenticationResponse> => {
  const userManagement = getWorkOS().userManagement;
  const authenticateWithGoogleIdToken = Reflect.get(userManagement, 'authenticateWithGoogleIdToken');
  if (typeof authenticateWithGoogleIdToken !== 'function') {
    throw new Error('@workos-inc/node 10.12 or newer is required for Google One Tap.');
  }

  return Reflect.apply(authenticateWithGoogleIdToken, userManagement, [
    {
      clientId: WORKOS_CLIENT_ID,
      token,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: request.headers.get('user-agent') ?? undefined,
    },
  ]);
};

export function handleGoogleOneTap(options: HandleGoogleOneTapOptions = {}) {
  const { returnPathname = '/', onError, onSuccess } = options;

  return async function POST(request: NextRequest): Promise<Response> {
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

      const authenticationResponse = await authenticate(request, token);
      await saveSession(authenticationResponse, request);
      await onSuccess?.(authenticationResponse);

      const redirectUrl = new URL(request.url);
      const parsedReturnUrl = new URL(returnPathname, 'https://placeholder.com');
      redirectUrl.pathname = parsedReturnUrl.pathname;
      redirectUrl.search = parsedReturnUrl.search;
      return noStore(redirectWithFallback(redirectUrl.toString()));
    } catch (error) {
      if (onError) {
        return noStore(await onError({ error, request }));
      }

      const { url } = await getAuthorizationUrl({ returnPathname });
      return noStore(redirectWithFallback(url));
    }
  };
}

function noStore(response: Response): Response {
  response.headers.set('Vary', 'Cookie');
  setCachePreventionHeaders(response.headers);
  return response;
}
