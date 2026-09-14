import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Regression guard for SEC-1219.
 *
 * A module-level `'use server'` directive turns *every* exported async function
 * in the module into a remotely invokable Next.js Server Action. Session-minting
 * primitives (`saveSession`, `encryptSession`, `withAuth`, ...) must never be
 * exposed that way. This is a one-line footgun that is easy to reintroduce
 * during a refactor with green CI, so we assert it directly here.
 *
 * The intended Server Actions surface lives in `actions.ts`, which exposes only
 * sanitized wrappers — that file *must* keep its `'use server'` directive.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

/**
 * Returns the module's leading directive (`use server` / `use client`) if the
 * first executable line is a bare string-literal statement, else `null`.
 * Skips blank lines and leading comments the way a JS engine does when
 * collecting the directive prologue.
 */
function leadingDirective(source: string): string | null {
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      continue;
    }
    const match = line.match(/^(['"])use (server|client)\1;?$/);
    return match ? `use ${match[2]}` : null;
  }
  return null;
}

describe('SEC-1219: server-only guard', () => {
  const protectedModules = ['./session.ts', './auth.ts', './validate-api-key.ts'];

  it.each(protectedModules)('%s must not be a module-level Server Action', (modulePath) => {
    const source = read(modulePath);

    // Must not open with `'use server'` (which would register every export as an action).
    expect(leadingDirective(source)).not.toBe('use server');
    // Belt and suspenders: no `'use server'` directive statement anywhere.
    expect(source).not.toMatch(/^\s*(['"])use server\1;?\s*$/m);
    // Must import `server-only` so an accidental client import is a build error.
    expect(source).toMatch(/^import ['"]server-only['"];/m);
  });

  it('actions.ts remains the intended Server Actions surface', () => {
    expect(leadingDirective(read('./actions.ts'))).toBe('use server');
  });
});
