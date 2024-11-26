process.env.WORKOS_API_KEY = 'sk_test_1234567890';
process.env.WORKOS_CLIENT_ID = '1234567890';
process.env.WORKOS_COOKIE_PASSWORD = 'kR620keEzOIzPThfnMEAba8XYgKdQ5vg';
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = 'http://localhost:3000/callback';
process.env.WORKOS_COOKIE_DOMAIN = 'example.com';

const cookieStore = new Map();
const headersStore = new Map();

type CookieValue = string | { [key: string]: string | number | boolean };

// Mock the next/headers module
jest.mock('next/headers', () => ({
  headers: async () => ({
    delete: jest.fn((name: string) => headersStore.delete(name)),
    get: jest.fn((name: string) => headersStore.get(name)),
    set: jest.fn((name: string, value: string) => headersStore.set(name, value)),
    _reset: () => {
      headersStore.clear();
    },
  }),
  cookies: async () => ({
    delete: jest.fn((nameOrObject: string | { name: string; [key: string]: unknown }) => {
      const cookieName = typeof nameOrObject === 'string' ? nameOrObject : nameOrObject.name;
      cookieStore.delete(cookieName);
    }),
    get: jest.fn((name: string) => cookieStore.get(name)),
    getAll: jest.fn(() => Array.from(cookieStore.entries())),
    set: jest.fn((name: string, value: CookieValue) => cookieStore.set(name, value)),
    _reset: () => {
      cookieStore.clear();
    },
  }),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));