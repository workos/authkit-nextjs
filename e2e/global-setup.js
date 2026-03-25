import { createEmulator } from 'workos/emulate';
const EMULATOR_PORT = 4100;
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
//# sourceMappingURL=global-setup.js.map