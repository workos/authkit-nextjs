import { defineConfig } from '@playwright/test';
const EMULATOR_PORT = 4100;
const NEXT_PORT = 3100;
const VINEXT_PORT = 3101;
const apps = (process.env.E2E_APPS || 'next').split(',').map((s) => s.trim());
const sharedEnv = {
    WORKOS_API_HOSTNAME: 'localhost',
    WORKOS_API_PORT: String(EMULATOR_PORT),
    WORKOS_API_HTTPS: 'false',
    WORKOS_API_KEY: 'sk_test_default',
    WORKOS_CLIENT_ID: 'client_emulated',
    WORKOS_COOKIE_PASSWORD: 'a-sufficiently-long-password-for-iron-session!!',
};
const appConfigs = {
    next: {
        name: 'next',
        port: NEXT_PORT,
        buildCommand: 'pnpm run build',
        startCommand: `pnpm run start -- -p ${NEXT_PORT}`,
        cwd: 'examples/next',
    },
    vinext: {
        name: 'vinext',
        port: VINEXT_PORT,
        buildCommand: 'pnpm run build',
        startCommand: `PORT=${VINEXT_PORT} pnpm run start`,
        cwd: 'examples/vinext',
    },
};
const webServers = apps
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
//# sourceMappingURL=playwright.config.js.map