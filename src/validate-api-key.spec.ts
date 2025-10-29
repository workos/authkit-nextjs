import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { validateApiKey } from './validate-api-key.js';
import { getWorkOS } from './workos.js';

// These are mocked in jest.setup.ts
import { headers } from 'next/headers';

const workos = getWorkOS();

describe('validate-api-key.ts', () => {
  beforeEach(async () => {
    // Clear all mocks between tests
    jest.clearAllMocks();

    const nextHeaders = await headers();
    // @ts-expect-error - _reset is part of the mock
    nextHeaders._reset();
  });

  describe('validateApiKey', () => {
    it('should return valid API key when Bearer token is present and valid', async () => {
      const mockApiKeyResponse = {
        apiKey: {
          id: 'api_key_123',
          object: 'api_key' as const,
          name: 'Test API Key',
          obfuscatedValue: 'sk_…7890',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          lastUsedAt: '2024-01-01T00:00:00Z',
          permissions: [],
          owner: { type: 'organization' as const, id: 'org_123' },
        },
      };

      jest.spyOn(workos.apiKeys, 'validateApiKey').mockResolvedValue(mockApiKeyResponse);

      const nextHeaders = await headers();
      nextHeaders.set('authorization', 'Bearer sk_test_1234567890');

      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).toHaveBeenCalledWith({
        value: 'sk_test_1234567890',
      });
      expect(result).toEqual(mockApiKeyResponse);
    });

    it('should return { apiKey: null } when no authorization header is present', async () => {
      // Don't set any authorization header
      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).not.toHaveBeenCalled();
      expect(result).toEqual({ apiKey: null });
    });

    it('should return { apiKey: null } when authorization header is empty', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('authorization', '');

      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).not.toHaveBeenCalled();
      expect(result).toEqual({ apiKey: null });
    });

    it('should return { apiKey: null } when authorization header does not start with Bearer', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('authorization', 'Basic dXNlcjpwYXNz');

      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).not.toHaveBeenCalled();
      expect(result).toEqual({ apiKey: null });
    });

    it('should return { apiKey: null } when Bearer token is missing', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('authorization', 'Bearer');

      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).not.toHaveBeenCalled();
      expect(result).toEqual({ apiKey: null });
    });

    it('should return { apiKey: null } when Bearer token is only whitespace', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('authorization', 'Bearer   ');

      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).not.toHaveBeenCalled();
      expect(result).toEqual({ apiKey: null });
    });

    it('should return { apiKey: null } when WorkOS validation fails', async () => {
      const mockResponse = { apiKey: null };
      jest.spyOn(workos.apiKeys, 'validateApiKey').mockResolvedValue(mockResponse);

      const nextHeaders = await headers();
      nextHeaders.set('authorization', 'Bearer invalid_key');

      const result = await validateApiKey();

      expect(workos.apiKeys.validateApiKey).toHaveBeenCalledWith({
        value: 'invalid_key',
      });
      expect(result).toEqual({ apiKey: null });
    });
  });
});
