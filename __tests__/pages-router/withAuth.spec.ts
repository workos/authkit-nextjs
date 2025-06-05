import { withAuth } from '../../src/pages-router/server/withAuth';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import type { GetServerSidePropsContextWithAuth } from '../../src/pages-router/types';

// Mock the adapter
jest.mock('../../src/pages-router/adapters', () => ({
  createPagesAdapter: jest.fn(() => ({
    getSession: jest.fn(),
  })),
}));

jest.mock('../../src/get-authorization-url', () => ({
  getAuthorizationUrl: jest.fn(),
}));

describe('withAuth (Pages Router)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should inject auth into context when session exists', async () => {
    const mockSession = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      user: { id: 'user-123', email: 'test@example.com' },
    };

    const { createPagesAdapter } = require('../../src/pages-router/adapters');
    createPagesAdapter.mockReturnValue({
      getSession: jest.fn().mockResolvedValue(mockSession),
    });

    const handler = jest.fn().mockResolvedValue({ props: { test: 'value' } });
    const wrappedHandler = withAuth(handler);

    const context = {
      req: { cookies: {} },
      res: {},
      query: {},
      resolvedUrl: '/test',
    } as any;

    const result = await wrappedHandler(context);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: mockSession,
      })
    );
    expect(result).toEqual({ props: { test: 'value' } });
  });

  it('should redirect to sign in when ensureSignedIn is true and no session', async () => {
    const { createPagesAdapter } = require('../../src/pages-router/adapters');
    const { getAuthorizationUrl } = require('../../src/get-authorization-url');
    
    createPagesAdapter.mockReturnValue({
      getSession: jest.fn().mockResolvedValue(null),
    });
    
    getAuthorizationUrl.mockResolvedValue('https://auth.example.com/signin');

    const handler = jest.fn();
    const wrappedHandler = withAuth(handler, { ensureSignedIn: true });

    const context = {
      req: { cookies: {} },
      res: {},
      query: {},
      resolvedUrl: '/protected',
    } as any;

    const result = await wrappedHandler(context);

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({
      redirect: {
        destination: 'https://auth.example.com/signin',
        permanent: false,
      },
    });
  });

  it('should pass null auth when no session and ensureSignedIn is false', async () => {
    const { createPagesAdapter } = require('../../src/pages-router/adapters');
    createPagesAdapter.mockReturnValue({
      getSession: jest.fn().mockResolvedValue(null),
    });

    const handler = jest.fn().mockResolvedValue({ props: {} });
    const wrappedHandler = withAuth(handler);

    const context = {
      req: { cookies: {} },
      res: {},
      query: {},
      resolvedUrl: '/public',
    } as any;

    const result = await wrappedHandler(context);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: null,
      })
    );
  });
});