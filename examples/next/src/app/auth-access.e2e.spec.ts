import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import net from 'node:net';
import type { Readable } from 'node:stream';

const DEV_SERVER_START_TIMEOUT_MS = 45_000;

async function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve a free TCP port'));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

type NextDevProcess = ChildProcessByStdio<null, Readable, Readable>;

async function startNextDevServer(port: number): Promise<NextDevProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['-C', 'examples/next', 'dev', '--port', String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WORKOS_API_KEY: 'sk_test_1234567890',
        WORKOS_CLIENT_ID: 'client_1234567890',
        WORKOS_COOKIE_PASSWORD: 'kR620keEzOIzPThfnMEAba8XYgKdQ5vg',
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: 'http://localhost:3000/callback',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('Ready in')) {
        ready = true;
        cleanup();
        resolve(child);
      }
    };

    const onExit = (code: number | null) => {
      if (ready) return;
      cleanup();
      reject(new Error(`Next dev exited before ready (code=${code ?? 'null'})`));
    };

    const timeout = setTimeout(() => {
      if (ready) return;
      cleanup();
      child.kill('SIGINT');
      reject(new Error('Timed out waiting for Next dev server readiness'));
    }, DEV_SERVER_START_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', onExit);
  });
}

async function stopProcess(child: NextDevProcess | null): Promise<void> {
  if (!child || child.killed) return;

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGINT');
  });
}

describe('auth/access route guard e2e smoke', () => {
  let child: NextDevProcess | null = null;
  let baseUrl = '';

  beforeAll(async () => {
    const port = await reserveFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = await startNextDevServer(port);
  }, 60_000);

  afterAll(async () => {
    await stopProcess(child);
  });

  it('redirects anonymous protected route traffic to WorkOS authorization (happy path)', async () => {
    const response = await fetch(`${baseUrl}/account`, { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';

    expect(response.status).toBe(307);
    expect(location).toContain('https://api.workos.com/user_management/authorize');
    expect(location).toContain('screen_hint=sign-in');
  });

  it('rejects open redirect returnTo payloads on sign-in route (negative path)', async () => {
    const response = await fetch(`${baseUrl}/sign-in?returnTo=https://evil.example`, { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';

    expect(response.status).toBe(307);
    expect(location).toContain('https://api.workos.com/user_management/authorize');
    expect(location).not.toContain('evil.example');
  });

  it('returns callback error response when code/state are missing', async () => {
    const response = await fetch(`${baseUrl}/auth/callback`, { redirect: 'manual' });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        message: 'Something went wrong',
        description: "Couldn't sign in. If you are not sure what happened, please contact your organization admin.",
      },
    });
  });
});
