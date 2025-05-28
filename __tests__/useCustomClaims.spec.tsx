import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { getAccessTokenAction } from '../src/actions.js';
import { useAuth } from '../src/components/authkit-provider.js';
import { useCustomClaims } from '../src/components/useCustomClaims.js';

jest.mock('../src/actions.js', () => ({
  getAccessTokenAction: jest.fn(),
  refreshAccessTokenAction: jest.fn(),
}));

jest.mock('../src/components/authkit-provider.js', () => {
  const originalModule = jest.requireActual('../src/components/authkit-provider.js');
  return {
    ...originalModule,
    useAuth: jest.fn(),
  };
});

jest.mock('jose', () => ({
  decodeJwt: jest.fn((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch {
      return null;
    }
  }),
}));

describe('useCustomClaims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const CustomClaimsTestComponent = () => {
    const customClaims = useCustomClaims();
    return (
      <div>
        <div data-testid="claims">{JSON.stringify(customClaims)}</div>
      </div>
    );
  };

  it('should return null when no access token is available', async () => {
    (getAccessTokenAction as jest.Mock).mockResolvedValue(undefined);

    const { getByTestId } = render(<CustomClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent('null');
    });
  });

  it('should return custom claims when access token is available', async () => {
    const payload = {
      aud: 'audience',
      exp: 9999999999,
      iat: 1234567800,
      iss: 'issuer',
      sub: 'user_123',
      sid: 'session_123',
      org_id: 'org_123',
      role: 'admin',
      permissions: ['read', 'write'],
      entitlements: ['feature_a'],
      jti: 'jwt_123',
      nbf: 1234567800,
      // Custom claims
      customField1: 'value1',
      customField2: 42,
      customObject: { nested: 'data' },
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (getAccessTokenAction as jest.Mock).mockResolvedValue(token);

    const { getByTestId } = render(<CustomClaimsTestComponent />);

    await waitFor(() => {
      const expectedCustomClaims = {
        customField1: 'value1',
        customField2: 42,
        customObject: { nested: 'data' },
      };
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(expectedCustomClaims));
    });
  });

  it('should return empty object when token has no custom claims', async () => {
    const payload = {
      aud: 'audience',
      exp: 9999999999,
      iat: 1234567800,
      iss: 'issuer',
      sub: 'user_123',
      sid: 'session_123',
      org_id: 'org_123',
      role: 'admin',
      permissions: ['read', 'write'],
      entitlements: ['feature_a'],
      jti: 'jwt_123',
      nbf: 1234567800,
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (getAccessTokenAction as jest.Mock).mockResolvedValue(token);

    const { getByTestId } = render(<CustomClaimsTestComponent />);

    await waitFor(() => {
      expect(getByTestId('claims')).toHaveTextContent('{}');
    });
  });

  it('should handle partial standard claims', async () => {
    const payload = {
      sub: 'user_123',
      exp: 9999999999,
      customField: 'value',
      anotherCustom: true,
    };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    (getAccessTokenAction as jest.Mock).mockResolvedValue(token);

    const { getByTestId } = render(<CustomClaimsTestComponent />);

    await waitFor(() => {
      const expectedCustomClaims = {
        customField: 'value',
        anotherCustom: true,
      };
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(expectedCustomClaims));
    });
  });

  it('should handle complex nested custom claims', async () => {
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

    (getAccessTokenAction as jest.Mock).mockResolvedValue(token);

    const { getByTestId } = render(<CustomClaimsTestComponent />);

    await waitFor(() => {
      const expectedCustomClaims = {
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
      expect(getByTestId('claims')).toHaveTextContent(JSON.stringify(expectedCustomClaims));
    });
  });
});
