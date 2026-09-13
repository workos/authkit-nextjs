import { createHash } from 'node:crypto';
import { sealData, unsealData } from 'iron-session';
import * as nextHeaders from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { RequestCookies, ResponseCookies } from 'next/dist/server/web/spec-extension/cookies.js';
import { RequestCookiesAdapter } from 'next/dist/server/web/spec-extension/adapters/request-cookies.js';
import { handleAuth } from './authkit-callback-route.js';
import { getPKCECookieNameForState, getStateFromPKCECookieValue } from './pkce.js';
import { updateSessionMiddleware, withAuth } from './session.js';
import { getWorkOS } from './workos.js';

const callbackUri = 'https://preview.example/auth/callback?tenant=blue&label=hello%20world~';
const documentHeaders = { accept: 'text/html' };
const routingData = {
  purpose: 'authkit-start',
  redirectUri: callbackUri,
  returnPathname: '/dashboard?tab=details',
  screenHint: 'sign-in',
};
const sealOptions = { password: process.env.WORKOS_COOKIE_PASSWORD!, ttl: 0 };

async function readFlow(response: Response) {
  expect(response.status).toBe(307);
  const url = new URL(response.headers.get('Location')!);
  const state = url.searchParams.get('state')!;
  const cookie = new ResponseCookies(response.headers).get(getPKCECookieNameForState(state));
  expect(cookie?.value).toBe(state);
  return { url, state, cookie: cookie!, data: await getStateFromPKCECookieValue(state) };
}

describe('page authentication start', () => {
  let startUrl: string;

  beforeEach(async () => {
    const cookies = await nextHeaders.cookies();
    // @ts-expect-error - _reset is part of the shared Next mock
    cookies._reset();
    const headers = await nextHeaders.headers();
    // @ts-expect-error - _reset is part of the shared Next mock
    headers._reset();
    headers.set('x-workos-middleware', 'true');
    headers.set('x-url', 'https://preview.example/dashboard?tab=details');
    headers.set('x-redirect-uri', callbackUri);
    await withAuth({ ensureSignedIn: true });
    startUrl = vi.mocked(redirect).mock.calls.at(-1)![0];
    vi.mocked(redirect).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('redirects through the existing callback without writing render-time cookies', async () => {
    const request = new NextRequest('https://preview.example/dashboard?tab=details', {
      headers: documentHeaders,
    });
    const proxyResponse = await updateSessionMiddleware(
      request,
      false,
      { enabled: false, unauthenticatedPaths: [] },
      callbackUri,
      ['/dashboard'],
    );
    expect(proxyResponse.headers.getSetCookie()).toEqual([]);

    const headers = await nextHeaders.headers();
    for (const name of proxyResponse.headers.get('x-middleware-override-headers')!.split(',')) {
      headers.set(name, proxyResponse.headers.get(`x-middleware-request-${name}`)!);
    }
    const readonlyCookies = RequestCookiesAdapter.seal(new RequestCookies(new Headers()));
    const cookieSpy = vi.spyOn(nextHeaders, 'cookies').mockResolvedValue(readonlyCookies);
    await withAuth({ ensureSignedIn: true });
    cookieSpy.mockRestore();

    const start = new URL(vi.mocked(redirect).mock.calls[0][0]);
    expect(start.origin + start.pathname).toBe('https://preview.example/auth/callback');
    expect(start.searchParams.get('tenant')).toBe('blue');
    expect(start.searchParams.get('state')).toBeNull();
    expect(await unsealData(start.searchParams.get('__authkit_start')!, sealOptions)).toEqual({
      ...routingData,
      screenHint: 'sign-up',
    });

    const flow = await readFlow(await handleAuth()(new NextRequest(start, { headers: documentHeaders })));
    expect(flow.url.origin).toBe('https://api.workos.com');
    expect(flow.url.searchParams.get('redirect_uri')).toBe(callbackUri);
    expect(flow.url.searchParams.get('screen_hint')).toBe('sign-up');
    expect(flow.data.returnPathname).toBe('/dashboard?tab=details');
    expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(flow.url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(flow.data.codeVerifier).digest('base64url'),
    );
    expect(flow.cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
  });

  it('preserves the configured URI and cookie settings when baseURL corrects an internal callback origin', async () => {
    const request = new NextRequest(startUrl.replace('https://preview.example', 'http://internal:3000'), {
      headers: documentHeaders,
    });
    const flow = await readFlow(await handleAuth({ baseURL: 'https://preview.example' })(request));
    expect(flow.url.searchParams.get('redirect_uri')).toBe(callbackUri);
    expect(flow.cookie.secure).toBe(true);
    expect(flow.data.returnPathname).toBe('/dashboard?tab=details');
  });

  it('starts fresh PKCE from a cached routing link rather than expiring the link', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    const flow = await readFlow(await handleAuth()(new NextRequest(startUrl, { headers: documentHeaders })));
    expect(flow.cookie.maxAge).toBe(600);
    expect(flow.data.returnPathname).toBe('/dashboard?tab=details');
  });

  it.each<Record<string, string>>([
    { accept: '*/*', RSC: '1', 'Next-Router-State-Tree': '["",{}]' },
    { accept: '*/*', RSC: '1', 'Next-Router-Prefetch': '1' },
    { accept: 'text/html', Purpose: 'prefetch' },
    { accept: 'text/html', 'Sec-Purpose': 'prefetch' },
  ])('does not start a flow for a passive request with %j', async (headers) => {
    const generate = vi.spyOn(getWorkOS().pkce, 'generate');
    const handler = handleAuth();
    const response = await handler(new NextRequest(startUrl, { headers }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.text()).toBe('');
    expect(generate).not.toHaveBeenCalled();

    // The same URL still starts authentication when Next falls back to a document navigation.
    await readFlow(await handler(new NextRequest(startUrl, { headers: documentHeaders })));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('creates independent flows and treats code/state plus start parameters as a normal callback', async () => {
    const handler = handleAuth();
    const flowA = await readFlow(await handler(new NextRequest(startUrl, { headers: documentHeaders })));
    const secondStart = new NextRequest(startUrl, { headers: documentHeaders });
    secondStart.cookies.set(flowA.cookie.name, flowA.cookie.value);
    const flowB = await readFlow(await handler(secondStart));
    expect(flowB.state).not.toBe(flowA.state);
    expect(flowB.data.codeVerifier).not.toBe(flowA.data.codeVerifier);
    expect(flowB.cookie.name).not.toBe(flowA.cookie.name);

    const callback = new NextRequest(startUrl, { headers: documentHeaders });
    callback.nextUrl.searchParams.set('code', 'test-code');
    callback.nextUrl.searchParams.set('state', flowA.state);
    callback.cookies.set(flowA.cookie.name, flowA.cookie.value);
    callback.cookies.set(flowB.cookie.name, flowB.cookie.value);
    const exchange = vi
      .spyOn(getWorkOS().userManagement, 'authenticateWithCode')
      .mockRejectedValue(new Error('offline exchange stub'));
    const response = await handler(callback);
    expect(exchange).toHaveBeenCalledWith({
      clientId: process.env.WORKOS_CLIENT_ID,
      code: 'test-code',
      codeVerifier: flowA.data.codeVerifier,
    });
    const cookies = response.headers.getSetCookie();
    expect(cookies.find((cookie) => cookie.startsWith(`${flowA.cookie.name}=`))).toContain('Max-Age=0');
    expect(cookies.some((cookie) => cookie.startsWith(`${flowB.cookie.name}=`))).toBe(false);

    // Possessing a valid sealed state is not enough to create its cookie or exchange a code.
    exchange.mockClear();
    callback.cookies.delete(flowA.cookie.name);
    const rejected = await handler(callback);
    expect(rejected.status).toBe(500);
    expect(exchange).not.toHaveBeenCalled();
    expect(rejected.headers.getSetCookie().find((cookie) => cookie.startsWith(`${flowA.cookie.name}=`))).toContain(
      'Max-Age=0',
    );

    const substitutedState = new URL(startUrl);
    substitutedState.searchParams.set('__authkit_start', flowA.state);
    const onError = vi.fn(() => new Response(null, { status: 500 }));
    const rejectedStart = await handleAuth({ onError })(
      new NextRequest(substitutedState, { headers: documentHeaders }),
    );
    expect(rejectedStart.status).toBe(500);
    expect(rejectedStart.headers.getSetCookie()).toEqual([]);
    expect(exchange).not.toHaveBeenCalled();
    expect(JSON.stringify(onError.mock.calls[0])).not.toContain(flowA.data.codeVerifier);
  });

  it.each([
    { ...routingData, purpose: 'oauth-state' },
    { ...routingData, redirectUri: 'not-a-url' },
    { ...routingData, returnPathname: 'https://evil.example' },
    { ...routingData, returnPathname: '//evil.example' },
    { ...routingData, returnPathname: '/\\evil.example' },
    { ...routingData, screenHint: 'unknown' },
    { ...routingData, codeVerifier: 'not-routing-data' },
  ])('rejects a sealed payload with the wrong routing shape: %j', async (data) => {
    const generate = vi.spyOn(getWorkOS().pkce, 'generate');
    const url = new URL(startUrl);
    url.searchParams.set('__authkit_start', await sealData(data, sealOptions));
    const response = await handleAuth()(new NextRequest(url, { headers: documentHeaders }));
    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(['&__authkit_start=duplicate', '&code=', '&state='])(
    'does not bypass callback checks with %s',
    async (suffix) => {
      const generate = vi.spyOn(getWorkOS().pkce, 'generate');
      const response = await handleAuth()(new NextRequest(startUrl + suffix, { headers: documentHeaders }));
      expect(response.status).toBe(500);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('rejects a tampered routing payload', async () => {
    const url = new URL(startUrl);
    const payload = url.searchParams.get('__authkit_start')!;
    url.searchParams.set('__authkit_start', payload.replace('Fe26.2', 'invalid'));
    const response = await handleAuth()(new NextRequest(url, { headers: documentHeaders }));
    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
