/// <reference types="vitest/globals" />

process.env.WORKOS_API_KEY = 'sk_test_1234567890';
process.env.WORKOS_CLIENT_ID = 'client_1234567890';
process.env.WORKOS_COOKIE_PASSWORD = 'kR620keEzOIzPThfnMEAba8XYgKdQ5vg';
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = 'http://localhost:3000/callback';
process.env.WORKOS_COOKIE_DOMAIN = 'example.com';

// Mock the next/headers module
vi.mock('next/headers', () => {
  const cookieStore = new Map();
  const headersStore = new Map();

  return {
    headers: async () => ({
      delete: vi.fn((name: string) => headersStore.delete(name)),
      get: vi.fn((name: string) => headersStore.get(name)),
      set: vi.fn((name: string, value: string) => headersStore.set(name, value)),
      _reset: () => {
        headersStore.clear();
      },
    }),
    cookies: async () => ({
      delete: vi.fn((nameOrObject: string | { name: string; [key: string]: unknown }) => {
        const cookieName = typeof nameOrObject === 'string' ? nameOrObject : nameOrObject.name;
        cookieStore.delete(cookieName);
      }),
      get: vi.fn((name: string) => cookieStore.get(name)),
      getAll: vi.fn(() => Array.from(cookieStore.entries())),
      set: vi.fn((name: string, value: string | { [key: string]: string | number | boolean }) =>
        cookieStore.set(name, {
          name,
          value,
        }),
      ),
      _reset: () => {
        cookieStore.clear();
      },
    }),
  };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));
