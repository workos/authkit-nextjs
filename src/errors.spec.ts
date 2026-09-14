import { AuthKitError, TokenRefreshError, getSessionErrorContext } from './errors.js';
import type { Session } from './interfaces.js';
import type { User } from '@workos-inc/node';

describe('AuthKitError', () => {
  it('creates error with message', () => {
    const error = new AuthKitError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('AuthKitError');
    expect(error).toBeInstanceOf(Error);
  });

  it('creates error with cause and data', () => {
    const originalError = new Error('Original error');
    const data = { userId: '123' };
    const error = new AuthKitError('Test error', originalError, data);

    expect(error.cause).toBe(originalError);
    expect(error.data).toEqual(data);
  });
});

describe('TokenRefreshError', () => {
  it('creates error with correct name and inheritance', () => {
    const error = new TokenRefreshError('Refresh failed');

    expect(error.name).toBe('TokenRefreshError');
    expect(error.message).toBe('Refresh failed');
    expect(error).toBeInstanceOf(AuthKitError);
    expect(error).toBeInstanceOf(Error);
  });

  it('creates error with cause and context', () => {
    const originalError = new Error('Network error');
    const error = new TokenRefreshError('Refresh failed', originalError, {
      userId: 'user_123',
      sessionId: 'session_456',
    });

    expect(error.cause).toBe(originalError);
    expect(error.userId).toBe('user_123');
    expect(error.sessionId).toBe('session_456');
  });

  it('has undefined properties when no context provided', () => {
    const error = new TokenRefreshError('Refresh failed');

    expect(error.userId).toBeUndefined();
    expect(error.sessionId).toBeUndefined();
  });
});

describe('getSessionErrorContext', () => {
  function createTestJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadStr = btoa(JSON.stringify(payload));
    return `${header}.${payloadStr}.test-signature`;
  }

  it('returns empty object for missing session', () => {
    expect(getSessionErrorContext(null)).toEqual({});
    expect(getSessionErrorContext(undefined)).toEqual({});
  });

  it('extracts userId and sessionId from access token', () => {
    const session: Session = {
      accessToken: createTestJwt({ sub: 'user_456', sid: 'session_123' }),
      refreshToken: 'refresh_token',
      user: {
        id: 'user_456',
        email: 'test@example.com',
        emailVerified: true,
        profilePictureUrl: null,
        firstName: null,
        lastName: null,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        object: 'user',
      } as User,
    };

    const context = getSessionErrorContext(session);
    expect(context.userId).toBe('user_456');
    expect(context.sessionId).toBe('session_123');
  });

  it('returns empty object for invalid JWT', () => {
    const session: Session = {
      accessToken: 'invalid-jwt',
      refreshToken: 'refresh_token',
      user: {
        id: 'user_123',
        email: 'test@example.com',
        emailVerified: true,
        profilePictureUrl: null,
        firstName: null,
        lastName: null,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        object: 'user',
      } as User,
    };

    const context = getSessionErrorContext(session);
    expect(context).toEqual({});
  });
});
