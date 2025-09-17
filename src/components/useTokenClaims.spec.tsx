import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { useAuth } from './authkit-provider.js';

jest.mock('../actions.js', () => ({
  getAccessTokenAction: jest.fn(),
  refreshAccessTokenAction: jest.fn(),
}));

jest.mock('./authkit-provider.js', () => {
  const originalModule = jest.requireActual('./authkit-provider.js');
  return {
    ...originalModule,
    useAuth: jest.fn(),
  };
});

jest.mock('./useAccessToken.js', () => ({
  useAccessToken: jest.fn(() => ({ accessToken: undefined })),
}));

jest.mock('jose', () => ({
  decodeJwt: jest.fn((token: string) => {
    if (token === 'malformed-token' || token === 'throw-error-token') {
      throw new Error('Invalid JWT');
    }
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT');
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch {
      throw new Error('Invalid JWT');
    }
  }),
}));

// Import after mocks are set up
import { useAccessToken } from './useAccessToken.js';
import { useTokenClaims } from './useTokenClaims.js';

describe('useTokenClaims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    // Reset useAccessToken mock to default
    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: undefined });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const TokenClaimsTestComponent = () => {
    const tokenClaims = useTokenClaims();
    return (
      <div>
        <div data-testid="claims">{JSON.stringify(tokenClaims)}</div>
      </div>
    );
  };

  it('should return empty object when no access token is available', async () => {
    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: undefined });

    const { getByTestId } = render(<TokenClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent('{}');
    });
  });

  it('should return all token claims when access token is available', async () => {
    const payload = {
      aud: 'audience',
      exp: 9999999999,
      iat: 1234567800,
      iss: 'issuer',
      sub: 'user_123',
      sid: 'session_123',
      org_id: 'org_123',
      role: 'admin',
      roles: ['admin'],
      permissions: ['read', 'write'],
      entitlements: ['feature_a'],
      feature_flags: ['device-authorization-grant'],
      jti: 'jwt_123',
      nbf: 1234567800,
      // Custom claims
      customField1: 'value1',
      customField2: 42,
      customObject: { nested: 'data' },
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: token });

    const { getByTestId } = render(<TokenClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(payload));
    });
  });

  it('should return all standard claims when token has only standard claims', async () => {
    const payload = {
      aud: 'audience',
      exp: 9999999999,
      iat: 1234567800,
      iss: 'issuer',
      sub: 'user_123',
      sid: 'session_123',
      org_id: 'org_123',
      role: 'admin',
      roles: ['admin'],
      permissions: ['read', 'write'],
      entitlements: ['feature_a'],
      feature_flags: ['device-authorization-grant'],
      jti: 'jwt_123',
      nbf: 1234567800,
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: token });

    const { getByTestId } = render(<TokenClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(payload));
    });
  });

  it('should handle partial claims', async () => {
    const payload = {
      sub: 'user_123',
      exp: 9999999999,
      customField: 'value',
      anotherCustom: true,
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: token });

    const { getByTestId } = render(<TokenClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(payload));
    });
  });

  it('should handle complex nested claims', async () => {
    const payload = {
      sub: 'user_123',
      exp: 9999999999,
      metadata: {
        preferences: {
          theme: 'dark',
          language: 'en',
        },
        settings: ['setting1', 'setting2'],
      },
      tags: ['tag1', 'tag2'],
      permissions_custom: {
        read: true,
        write: false,
      },
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: token });

    const { getByTestId } = render(<TokenClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(payload));
    });
  });

  it('should return empty object when decodeJwt throws an error', async () => {
    (useAccessToken as jest.Mock).mockReturnValue({ accessToken: 'malformed-token' });

    const { getByTestId } = render(<TokenClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent('{}');
    });
  });
});
