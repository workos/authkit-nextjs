import { renameSync } from 'fs';
import { resolve } from 'path';

const exampleDirs = ['../examples/next', '../examples/vinext'];

export default async function globalTeardown() {
  await globalThis.__emulator?.close();

  // Restore .env.local files that were moved aside during setup
  for (const dir of exampleDirs) {
    const bak = resolve(import.meta.dirname, dir, '.env.local.bak');
    const original = resolve(import.meta.dirname, dir, '.env.local');
    try {
      renameSync(bak, original);
    } catch {
      // .bak doesn't exist — nothing to restore
    }
  }
}
