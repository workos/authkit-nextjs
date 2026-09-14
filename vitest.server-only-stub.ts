// Test stub for the `server-only` package.
//
// In a real Next.js build the `server-only` import resolves to a no-op via the
// `react-server` export condition and only throws when a module is pulled into a
// client bundle. Vitest runs modules directly in node without that condition, so
// we alias `server-only` to this empty module during tests.
export {};
