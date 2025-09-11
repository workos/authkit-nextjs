import { decodeJwt } from './jwt.js';

describe('decodeJwt', () => {
  // Valid JWT token for testing (not a real token, just for testing purposes)
  const validToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5In0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwic3ViIjoiMTIzNDU2Nzg5MCIsImF1ZCI6WyJhdWRpZW5jZTEiLCJhdWRpZW5jZTIiXSwiZXhwIjoxNzM1Njg5NjAwLCJpYXQiOjE3MzU2MDMyMDAsImp0aSI6InVuaXF1ZS1pZCIsImN1c3RvbSI6InZhbHVlIiwibmVzdGVkIjp7ImtleSI6InZhbHVlIn19.signature';

  describe('valid JWT tokens', () => {
    it('should decode a valid JWT token', () => {
      const result = decodeJwt(validToken);

      expect(result.header).toEqual({
        alg: 'HS256',
        typ: 'JWT',
        kid: 'test-key',
      });

      expect(result.payload).toEqual({
        iss: 'https://example.com',
        sub: '1234567890',
        aud: ['audience1', 'audience2'],
        exp: 1735689600,
        iat: 1735603200,
        jti: 'unique-id',
        custom: 'value',
        nested: { key: 'value' },
      });
    });

    it('should decode a JWT with minimal header', () => {
      const minimalToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature';
      const result = decodeJwt(minimalToken);

      expect(result.header).toEqual({
        alg: 'HS256',
      });

      expect(result.payload).toEqual({
        sub: '123',
      });
    });

    it('should decode a JWT with custom payload type', () => {
      interface CustomPayload {
        customField: string;
        customNumber: number;
      }

      const customToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJjdXN0b21GaWVsZCI6InRlc3QiLCJjdXN0b21OdW1iZXIiOjQyfQ.signature';
      const result = decodeJwt<CustomPayload>(customToken);

      expect(result.payload.customField).toBe('test');
      expect(result.payload.customNumber).toBe(42);
      expect(result.payload.sub).toBe('123');
    });

    it('should handle JWT with array audience', () => {
      const result = decodeJwt(validToken);
      expect(result.payload.aud).toEqual(['audience1', 'audience2']);
    });

    it('should handle JWT with string audience', () => {
      const singleAudToken = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJzaW5nbGUtYXVkaWVuY2UifQ.signature';
      const result = decodeJwt(singleAudToken);
      expect(result.payload.aud).toBe('single-audience');
    });
  });

  describe('invalid JWT tokens', () => {
    it('should throw error for JWT with less than 3 parts', () => {
      expect(() => decodeJwt('invalid.token')).toThrow('Invalid JWT format');
      expect(() => decodeJwt('invalid')).toThrow('Invalid JWT format');
    });

    it('should throw error for JWT with more than 3 parts', () => {
      expect(() => decodeJwt('too.many.parts.here')).toThrow('Invalid JWT format');
    });

    it('should throw error for empty string', () => {
      expect(() => decodeJwt('')).toThrow('Invalid JWT format');
    });

    it('should throw error for invalid base64 in header', () => {
      const invalidHeaderToken = 'invalid!base64.eyJzdWIiOiIxMjMifQ.signature';
      expect(() => decodeJwt(invalidHeaderToken)).toThrow('Failed to decode JWT');
    });

    it('should throw error for invalid base64 in payload', () => {
      const invalidPayloadToken = 'eyJhbGciOiJIUzI1NiJ9.invalid!base64.signature';
      expect(() => decodeJwt(invalidPayloadToken)).toThrow('Failed to decode JWT');
    });

    it('should throw error for non-JSON header', () => {
      // "not json" in base64url
      const nonJsonHeaderToken = 'bm90IGpzb24.eyJzdWIiOiIxMjMifQ.signature';
      expect(() => decodeJwt(nonJsonHeaderToken)).toThrow('Failed to decode JWT');
    });

    it('should throw error for non-JSON payload', () => {
      // "not json" in base64url
      const nonJsonPayloadToken = 'eyJhbGciOiJIUzI1NiJ9.bm90IGpzb24.signature';
      expect(() => decodeJwt(nonJsonPayloadToken)).toThrow('Failed to decode JWT');
    });
  });

  describe('edge cases', () => {
    it('should handle empty header object', () => {
      const emptyHeaderToken = 'e30.eyJzdWIiOiIxMjMifQ.signature';
      const result = decodeJwt(emptyHeaderToken);
      expect(result.header).toEqual({});
    });

    it('should handle empty payload object', () => {
      const emptyPayloadToken = 'eyJhbGciOiJIUzI1NiJ9.e30.signature';
      const result = decodeJwt(emptyPayloadToken);
      expect(result.payload).toEqual({});
    });

    it('should handle JWT with null values', () => {
      const nullValueToken = 'eyJhbGciOm51bGx9.eyJzdWIiOm51bGwsImRhdGEiOm51bGx9.signature';
      const result = decodeJwt(nullValueToken);
      expect(result.header.alg).toBeNull();
      expect(result.payload.sub).toBeNull();
    });

    it('should handle JWT with nested objects', () => {
      const nestedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJkYXRhIjp7Im5lc3RlZCI6eyJkZWVwIjoidmFsdWUifX19.signature';
      const result = decodeJwt(nestedToken);
      expect(result.payload).toEqual({
        data: {
          nested: {
            deep: 'value',
          },
        },
      });
    });

    it('should handle JWT with arrays in payload', () => {
      const arrayToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlcyI6WyJhZG1pbiIsInVzZXIiXSwic2NvcGVzIjpbInJlYWQiLCJ3cml0ZSJdfQ.signature';
      const result = decodeJwt(arrayToken);
      expect(result.payload).toEqual({
        roles: ['admin', 'user'],
        scopes: ['read', 'write'],
      });
    });

    it('should handle JWT with numeric values', () => {
      const numericToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjb3VudCI6NDIsInJhdGlvIjozLjE0LCJhY3RpdmUiOnRydWV9.signature';
      const result = decodeJwt(numericToken);
      expect(result.payload).toEqual({
        count: 42,
        ratio: 3.14,
        active: true,
      });
    });
  });
});
