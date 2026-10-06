import { headers } from 'next/headers';
import { NextRequest, type NextFetchEvent } from 'next/server';
import { authkitProxy, withAuth } from '../src/index.js';
import { getPKCECookieNameForState, getStateFromPKCECookieValue } from '../src/pkce.js';
import proxy from './quickstart/src/proxy.js';
import HomePage from './quickstart/src/app/page.js';

vi.mock('@workos-inc/authkit-nextjs', () => ({ authkitProxy, withAuth }));

// Next.js supplies this event, but AuthKit does not use it.
const event = {} as NextFetchEvent;

function documentRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { accept: 'text/html' } });
}

describe('quickstart', () => {
  it('keeps the home page public', async () => {
    const response = await proxy(documentRequest('/'), event);

    expect(response?.status).toBe(200);
    expect(response?.headers.get('location')).toBeNull();
  });

  it('redirects signed-out account requests with a matching PKCE cookie before rendering', async () => {
    const response = await proxy(documentRequest('/account'), event);

    expect(response?.status).toBe(307);
    const authorizationUrl = new URL(response!.headers.get('location')!);
    const state = authorizationUrl.searchParams.get('state')!;
    expect(response!.headers.getSetCookie()).toEqual(
      expect.arrayContaining([expect.stringContaining(`${getPKCECookieNameForState(state)}=${state};`)]),
    );
    expect(await getStateFromPKCECookieValue(state)).toMatchObject({ returnPathname: '/account' });
  });

  it('uses document navigation for sign-in instead of a Next.js client-side link', async () => {
    const requestHeaders = await headers();
    requestHeaders.set('x-workos-middleware', 'true');
    requestHeaders.delete('x-workos-session');

    const page = await HomePage();

    expect(page.props.children).toContainEqual(
      expect.objectContaining({ type: 'a', props: { href: '/login', children: 'Sign in' } }),
    );
  });
});
