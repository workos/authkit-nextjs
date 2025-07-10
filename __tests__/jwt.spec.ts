import { parseToken } from '../src/jwt.js';

describe('jwt', () => {
  describe('parseToken', () => {
    it('should return empty object when token is undefined', () => {
      expect(parseToken(undefined)).toEqual({});
    });

    it('should return empty object when token is empty string', () => {
      expect(parseToken('')).toEqual({});
    });

    it('should throw error when token has invalid format (less than 3 parts)', () => {
      expect(() => parseToken('invalid.token')).toThrow('Invalid JWT format');
      expect(() => parseToken('only')).toThrow('Invalid JWT format');
    });

    it('should throw error when token has invalid format (more than 3 parts)', () => {
      expect(() => parseToken('too.many.parts.here')).toThrow('Invalid JWT format');
    });

    it('should parse valid JWT with base64url encoding', () => {
      // Standard JWT with base64url encoding (using - and _ characters)
      const payload = { sub: '1234567890', name: 'John Doe', iat: 1516239022 };
      const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${encodedPayload}.mock-signature`;

      const result = parseToken(token);
      expect(result).toEqual(payload);
    });

    it('should parse valid JWT with regular base64 encoding', () => {
      // JWT with regular base64 encoding (using + and / characters)
      const payload = { sub: '1234567890', name: 'John Doe', admin: true };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${encodedPayload}.mock-signature`;

      const result = parseToken(token);
      expect(result).toEqual(payload);
    });

    it('should handle payload with special characters requiring base64 padding', () => {
      // Payload that when encoded requires padding characters
      const payload = { id: '123', data: 'x' };
      const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const token = `header.${encodedPayload}.signature`;

      const result = parseToken(token);
      expect(result).toEqual(payload);
    });

    it('should parse token with complex nested payload', () => {
      const payload = {
        sub: 'user123',
        exp: 1234567890,
        permissions: ['read', 'write'],
        metadata: {
          organization: 'acme',
          roles: ['admin', 'user'],
        },
      };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      const result = parseToken(token);
      expect(result).toEqual(payload);
    });

    it('should handle generic type parameter correctly', () => {
      interface CustomClaims {
        customField: string;
        customNumber: number;
      }

      const payload = {
        sub: 'user123',
        customField: 'custom value',
        customNumber: 42,
      };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      const result = parseToken<CustomClaims>(token);
      expect(result.customField).toBe('custom value');
      expect(result.customNumber).toBe(42);
      expect(result.sub).toBe('user123');
    });

    it('should throw error when payload is not valid JSON', () => {
      const invalidPayload = btoa('not-json');
      const token = `header.${invalidPayload}.signature`;

      expect(() => parseToken(token)).toThrow();
    });

    it('should handle empty payload object', () => {
      const payload = {};
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      const result = parseToken(token);
      expect(result).toEqual({});
    });

    it('should handle tokens with URL-unsafe characters in all positions', () => {
      // Test various payloads that result in +, /, and = in different positions
      const testCases = [
        { data: '>>?' }, // Results in Pj4/
        { data: '>>>' }, // Results in Pj4+
        { data: '?' }, // Results in Pw==
      ];

      testCases.forEach((payload) => {
        const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        const token = `header.${encodedPayload}.signature`;

        const result = parseToken(token);
        expect(result).toEqual(payload);
      });
    });
  });
});
