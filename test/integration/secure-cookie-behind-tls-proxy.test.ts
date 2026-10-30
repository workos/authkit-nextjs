/**
 * Set Secure on the session cookie behind a TLS-terminating proxy.
 *
 * A load balancer or reverse proxy terminates HTTPS and forwards plain HTTP to
 * the app with `x-forwarded-proto: https`. The session cookie must still carry
 * `Secure` there, while plain local `http://localhost` development keeps it off.
 *
 * Everything runs on 127.0.0.1 with ephemeral ports:
 * - a stand-in WorkOS API answering the code exchange, the refresh and JWKS;
 * - the app: a Node HTTP server that builds a real `NextRequest` from its
 *   plain-HTTP socket, as a custom server (or vinext without trust-proxy) does,
 *   and hands it to the library's real `getSignInUrl()`, `handleAuth()` and
 *   `authkitProxy()`;
 * - a TLS-terminating proxy (`node:https`) with a throwaway self-signed certificate.
 *
 * Next.js's own server already derives `request.url`'s protocol from
 * `x-forwarded-proto`, so it would hide the case covered here.
 *
 * `cookies()` and `headers()` from `next/headers` need Next's request scope,
 * which a plain Node server doesn't have. They are backed by a per-request store
 * that uses Next's own `ResponseCookies` serializer, and the cookies set through
 * it are added to the response the way Next.js does.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import { NextRequest, type NextFetchEvent } from 'next/server';
import { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

interface RequestScope {
  requestHeaders: Headers;
  responseCookies: ResponseCookies;
}

const requestScope = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  return new AsyncLocalStorage<RequestScope>();
});

vi.mock('next/headers', () => {
  const currentScope = () => {
    const scope = requestScope.getStore();
    if (!scope) {
      throw new Error('next/headers was used outside a request');
    }
    return scope;
  };

  return {
    cookies: async () => currentScope().responseCookies,
    headers: async () => currentScope().requestHeaders,
  };
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REQUEST_TIMEOUT_MS = 10_000;
const SECURE = /;\s*secure\s*(;|$)/i;

// Made-up test values. Nothing here reaches WorkOS.
const CLIENT_ID = 'client_integration_test';
const API_KEY = 'sk_test_integration_not_a_real_key';
const COOKIE_PASSWORD = 'integration-test-cookie-password-0123456789';
const AUTH_CODE = 'test_authorization_code';
const REFRESH_TOKEN = 'test_refresh_token';
const USER = {
  object: 'user',
  id: 'user_integration_test',
  email: 'test@example.com',
  email_verified: true,
  first_name: 'Test',
  last_name: 'User',
  profile_picture_url: null,
  last_sign_in_at: '2024-01-01T00:00:00.000Z',
  locale: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  external_id: null,
  metadata: {},
};

const ENV_NAMES = [
  'WORKOS_API_HOSTNAME',
  'WORKOS_API_HTTPS',
  'WORKOS_API_PORT',
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_COOKIE_PASSWORD',
  'NEXT_PUBLIC_WORKOS_REDIRECT_URI',
  'WORKOS_COOKIE_DOMAIN',
  'WORKOS_COOKIE_NAME',
  'WORKOS_COOKIE_SAMESITE',
  'WORKOS_COOKIE_MAX_AGE',
  'WORKOS_ISSUER',
  'WORKOS_CLAIM_TOKEN',
];
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

let tmpDir: string | undefined;
let apiServer: http.Server | undefined;
let appServer: http.Server | undefined;
let proxyServer: https.Server | undefined;
let appPort = 0;
let proxyPort = 0;
let certPem = '';
let signingKey: KeyLike;
let publicJwk: JWK;
let authkit: typeof import('../../src/index.js');
let callbackRoute: ReturnType<(typeof authkit)['handleAuth']>;
let middleware: ReturnType<(typeof authkit)['authkitProxy']>;

// ---------------------------------------------------------------------------
// Stand-in WorkOS API
// ---------------------------------------------------------------------------

async function authenticationResponse(expiresInSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ sid: 'session_integration_test' })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setSubject(USER.id)
    .setIssuedAt(now - 120)
    .setExpirationTime(now + expiresInSeconds)
    .sign(signingKey);

  return {
    user: USER,
    access_token: accessToken,
    refresh_token: REFRESH_TOKEN,
    authentication_method: 'Password',
  };
}

async function handleWorkOSRequest(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && pathname === `/sso/jwks/${CLIENT_ID}`) {
    return sendJson(res, 200, { keys: [publicJwk] });
  }

  if (req.method === 'POST' && pathname === '/user_management/authenticate') {
    const body = JSON.parse(await readBody(req));

    if (body.client_id === CLIENT_ID && body.grant_type === 'authorization_code' && body.code === AUTH_CODE) {
      // Valid, but inside the middleware's refresh buffer, so the next request through it refreshes the session.
      return sendJson(res, 200, await authenticationResponse(20));
    }

    if (body.client_id === CLIENT_ID && body.grant_type === 'refresh_token' && body.refresh_token === REFRESH_TOKEN) {
      return sendJson(res, 200, await authenticationResponse(3600));
    }

    return sendJson(res, 400, { error: 'invalid_grant' });
  }

  return sendJson(res, 404, { message: 'Not found' });
}

// ---------------------------------------------------------------------------
// The app, served over plain HTTP
// ---------------------------------------------------------------------------

async function route(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    // Same as examples/next/src/app/login/route.ts.
    const signInUrl = await authkit.getSignInUrl();
    return new Response(null, { status: 307, headers: { location: signInUrl } });
  }

  if (pathname === '/callback') {
    return callbackRoute(request);
  }

  // Every other path goes through the middleware, as in examples/next/src/proxy.ts.
  const response = await middleware(request, {} as NextFetchEvent);
  if (!response || response.headers.has('x-middleware-next')) {
    // Stands in for the page the middleware lets through, keeping the middleware's headers.
    return new Response('ok', { status: 200, headers: response?.headers });
  }
  return response;
}

async function handleAppRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    // The socket is plain HTTP, so request.url starts with http:// even when a
    // TLS-terminating proxy sits in front. Only x-forwarded-proto says otherwise.
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const requestHeaders = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      for (const item of [value ?? []].flat()) {
        requestHeaders.append(name, item);
      }
    }
    const request = new NextRequest(url, { method: req.method, headers: requestHeaders });

    const cookieHeaders = new Headers();
    const response = await requestScope.run(
      { requestHeaders: request.headers, responseCookies: new ResponseCookies(cookieHeaders) },
      () => route(request),
    );

    const outgoing: Record<string, string | string[]> = {};
    response.headers.forEach((value, name) => {
      if (name !== 'set-cookie' && !name.startsWith('x-middleware-')) {
        outgoing[name] = value;
      }
    });
    // Like Next.js, add the cookies set through cookies() to the response.
    const setCookies = [...response.headers.getSetCookie(), ...cookieHeaders.getSetCookie()];
    if (setCookies.length > 0) {
      outgoing['set-cookie'] = setCookies;
    }

    res.writeHead(response.status, outgoing);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
}

// ---------------------------------------------------------------------------
// TLS-terminating proxy
// ---------------------------------------------------------------------------

function proxyTo(port: number) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port,
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          // Overwrite whatever the client sent, as a TLS-terminating proxy does.
          'x-forwarded-proto': 'https',
          'x-forwarded-host': req.headers.host ?? '',
        },
        agent: false,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('Upstream request timed out')));
    upstream.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
      }
      res.end(String(error));
    });
    req.pipe(upstream);
  };
}

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

interface Target {
  baseUrl: string;
  headers?: Record<string, string>;
  ca?: string;
}

interface ClientResponse {
  status: number;
  location?: string;
  setCookies: string[];
  body: string;
}

function send(target: Target, pathAndQuery: string, headers: Record<string, string> = {}): Promise<ClientResponse> {
  const url = new URL(pathAndQuery, target.baseUrl);
  const options = {
    method: 'GET',
    headers: { ...target.headers, ...headers },
    agent: false as const,
    timeout: REQUEST_TIMEOUT_MS,
  };

  return new Promise((resolve, reject) => {
    const onResponse = (res: IncomingMessage) => {
      readBody(res)
        .then((body) =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            setCookies: res.headers['set-cookie'] ?? [],
            body,
          }),
        )
        .catch(reject);
    };
    const req =
      url.protocol === 'https:'
        ? https.request(url, { ...options, ca: target.ca }, onResponse)
        : http.request(url, options, onResponse);
    req.on('timeout', () => req.destroy(new Error(`Request to ${url} timed out`)));
    req.on('error', reject);
    req.end();
  });
}

/** The first Set-Cookie line whose name starts with `namePrefix` and that isn't a deletion (empty value). */
function findSetCookie(setCookies: string[], namePrefix: string): string | undefined {
  return setCookies.find((line) => line.startsWith(namePrefix) && cookiePair(line).split('=')[1] !== '');
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';')[0];
}

/** Starts sign-in, follows it back to the callback and returns the session Set-Cookie line. */
async function signIn(target: Target): Promise<string> {
  const login = await send(target, '/login');
  expect(login.status, login.body).toBe(307);
  const state = new URL(login.location!).searchParams.get('state');
  const pkceCookie = findSetCookie(login.setCookies, 'wos-auth-verifier-');
  expect(state).toBeTruthy();
  expect(pkceCookie).toBeDefined();

  const callback = await send(target, `/callback?code=${AUTH_CODE}&state=${encodeURIComponent(state!)}`, {
    cookie: cookiePair(pkceCookie!),
  });
  expect(callback.status, callback.body).toBe(307);

  const sessionCookie = findSetCookie(callback.setCookies, 'wos-session=');
  expect(sessionCookie, callback.setCookies.join('\n')).toBeDefined();
  return sessionCookie!;
}

/** Sends the soon-to-expire session through the middleware and returns the refreshed session Set-Cookie line. */
async function refreshThroughMiddleware(target: Target, sessionCookie: string): Promise<string> {
  const response = await send(target, '/account', { accept: 'text/html', cookie: cookiePair(sessionCookie) });
  expect(response.status, response.body).toBe(200);

  const refreshed = findSetCookie(response.setCookies, 'wos-session=');
  expect(refreshed, response.setCookies.join('\n')).toBeDefined();
  expect(cookiePair(refreshed!)).not.toBe(cookiePair(sessionCookie));
  return refreshed!;
}

// ---------------------------------------------------------------------------
// Server plumbing
// ---------------------------------------------------------------------------

function readBody(stream: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function listen(server: http.Server | https.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function close(server: http.Server | https.Server | undefined): Promise<void> {
  if (!server?.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeAllConnections();
  });
}

function openssl(): string {
  return existsSync('/opt/homebrew/bin/openssl') ? '/opt/homebrew/bin/openssl' : 'openssl';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const scratchDir = path.join(ROOT, '.scratch');
  mkdirSync(scratchDir, { recursive: true });
  tmpDir = mkdtempSync(path.join(scratchDir, 'tls-proxy-'));
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');
  execFileSync(
    openssl(),
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'pipe', timeout: 15_000 },
  );
  certPem = readFileSync(certPath, 'utf8');

  const keyPair = await generateKeyPair('ES256');
  signingKey = keyPair.privateKey;
  publicJwk = { ...(await exportJWK(keyPair.publicKey)), kid: 'integration-test-key', alg: 'ES256', use: 'sig' };

  apiServer = http.createServer((req, res) => void handleWorkOSRequest(req, res));
  const apiPort = await listen(apiServer);

  appServer = http.createServer((req, res) => void handleAppRequest(req, res));
  appPort = await listen(appServer);

  proxyServer = https.createServer({ key: readFileSync(keyPath), cert: certPem }, proxyTo(appPort));
  proxyPort = await listen(proxyServer);

  for (const name of ENV_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, {
    WORKOS_API_HOSTNAME: '127.0.0.1',
    WORKOS_API_HTTPS: 'false',
    WORKOS_API_PORT: String(apiPort),
    WORKOS_CLIENT_ID: CLIENT_ID,
    WORKOS_API_KEY: API_KEY,
    WORKOS_COOKIE_PASSWORD: COOKIE_PASSWORD,
    // A plain local-dev redirect URI, so behind the proxy x-forwarded-proto is the only sign of HTTPS.
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: `http://localhost:${appPort}/callback`,
  });

  // The library reads its environment when it is first imported.
  authkit = await import('../../src/index.js');
  callbackRoute = authkit.handleAuth();
  middleware = authkit.authkitProxy();
});

afterAll(async () => {
  await Promise.all([close(proxyServer), close(appServer), close(apiServer)]);
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  for (const name of ENV_NAMES) {
    if (originalEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnv[name];
    }
  }
});

describe('behind a TLS-terminating proxy', () => {
  const viaProxy = (): Target => ({ baseUrl: `https://127.0.0.1:${proxyPort}`, ca: certPem });

  it('sets Secure on the session cookie issued by the callback', async () => {
    const sessionCookie = await signIn(viaProxy());

    expect(sessionCookie).toMatch(SECURE);
  });

  it('sets Secure on the session cookie refreshed by the middleware', async () => {
    const sessionCookie = await signIn(viaProxy());
    const refreshed = await refreshThroughMiddleware(viaProxy(), sessionCookie);

    expect(refreshed).toMatch(SECURE);
  });
});

describe('plain local http development', () => {
  // Straight at the app, as a browser on http://localhost would be, with no forwarding headers.
  const direct = (): Target => ({ baseUrl: `http://127.0.0.1:${appPort}`, headers: { host: `localhost:${appPort}` } });

  it('leaves Secure off the session cookie issued by the callback', async () => {
    const sessionCookie = await signIn(direct());

    expect(sessionCookie).not.toMatch(SECURE);
  });

  it('leaves Secure off the session cookie refreshed by the middleware', async () => {
    const sessionCookie = await signIn(direct());
    const refreshed = await refreshThroughMiddleware(direct(), sessionCookie);

    expect(refreshed).not.toMatch(SECURE);
  });
});
