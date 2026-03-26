import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

const EMULATOR_PORT = 4100;
const NEXT_PORT = 3100;
const VINEXT_PORT = 3101;

const apps = (process.env.E2E_APPS || 'next').split(',').map((s) => s.trim());

const sharedEnv: Record<string, string> = {
  WORKOS_API_HOSTNAME: 'localhost',
  WORKOS_API_PORT: String(EMULATOR_PORT),
  WORKOS_API_HTTPS: 'false',
  WORKOS_API_KEY: 'sk_test_default',
  WORKOS_CLIENT_ID: 'client_emulated',
  WORKOS_COOKIE_PASSWORD: 'a-sufficiently-long-password-for-iron-session!!',
};

// Move .env.local aside so test env vars aren't overridden by developer credentials.
// Restored by global-teardown.ts after tests complete.
const moveEnvAside = 'if [ -f .env.local ]; then mv .env.local .env.local.bak; fi';

interface AppConfig {
  name: string;
  port: number;
  buildCommand: string;
  startCommand: string;
  cwd: string;
}

const appConfigs: Record<string, AppConfig> = {
  next: {
    name: 'next',
    port: NEXT_PORT,
    buildCommand: `${moveEnvAside} && pnpm run build`,
    startCommand: `pnpm exec next start -p ${NEXT_PORT}`,
    cwd: '../examples/next',
  },
  vinext: {
    name: 'vinext',
    port: VINEXT_PORT,
    buildCommand: moveEnvAside,
    startCommand: `pnpm exec vinext dev -p ${VINEXT_PORT}`,
    cwd: '../examples/vinext',
  },
};

const webServers: PlaywrightTestConfig['webServer'] = apps
  .filter((name) => name in appConfigs)
  .map((name) => {
    const app = appConfigs[name];
    return {
      command: `${app.buildCommand} && ${app.startCommand}`,
      cwd: app.cwd,
      port: app.port,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        WORKOS_REDIRECT_URI: `http://localhost:${app.port}/callback`,
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: `http://localhost:${app.port}/callback`,
      },
    };
  });

const projects = apps
  .filter((name) => name in appConfigs)
  .map((name) => ({
    name,
    use: { baseURL: `http://localhost:${appConfigs[name].port}` },
  }));

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
  },
  webServer: webServers,
  projects,
});
