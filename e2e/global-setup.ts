import { createEmulator, type Emulator } from 'workos/emulate';

const EMULATOR_PORT = 4100;

declare global {
  var __emulator: Emulator | undefined;
}

export default async function globalSetup() {
  const emulator = await createEmulator({
    port: EMULATOR_PORT,
    seed: {
      users: [
        {
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          password: 'password',
          email_verified: true,
          impersonator: { email: 'admin@example.com', reason: 'E2E testing' },
        },
        {
          email: 'other@example.com',
          first_name: 'Other',
          last_name: 'Person',
          password: 'password',
          email_verified: true,
        },
      ],
      organizations: [
        {
          name: 'Test Organization',
          domains: [{ domain: 'example.com', state: 'verified' as const }],
        },
      ],
    },
  });

  // Verify emulator is healthy
  const health = await fetch(`${emulator.url}/health`);
  if (!health.ok) {
    throw new Error(`Emulator health check failed: ${health.status}`);
  }

  globalThis.__emulator = emulator;
}
