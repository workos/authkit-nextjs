import { NextResponse } from 'next/server';
import { redirectWithFallback, errorResponseWithFallback } from '../src/utils.js';

describe('utils', () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe('redirectWithFallback', () => {
    it('uses NextResponse.redirect when available', () => {
      const redirectUrl = 'https://example.com';
      const mockRedirect = jest.fn().mockReturnValue('redirected');
      const originalRedirect = NextResponse.redirect;

      NextResponse.redirect = mockRedirect;

      const result = redirectWithFallback(redirectUrl);

      expect(mockRedirect).toHaveBeenCalledWith(redirectUrl);
      expect(result).toBe('redirected');

      NextResponse.redirect = originalRedirect;
    });

    it('falls back to standard Response when NextResponse exists but redirect is undefined', async () => {
      const redirectUrl = 'https://example.com';

      jest.resetModules();

      jest.mock('next/server', () => ({
        NextResponse: {
          // exists but has no redirect method
        },
      }));

      const { redirectWithFallback } = await import('../src/utils.js');

      const result = redirectWithFallback(redirectUrl);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(307);
      expect(result.headers.get('Location')).toBe(redirectUrl);
    });

    it('falls back to standard Response when NextResponse is undefined', async () => {
      const redirectUrl = 'https://example.com';

      jest.resetModules();

      // Mock with undefined NextResponse
      jest.mock('next/server', () => ({
        NextResponse: undefined,
      }));

      const { redirectWithFallback } = await import('../src/utils.js');

      const result = redirectWithFallback(redirectUrl);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(307);
      expect(result.headers.get('Location')).toBe(redirectUrl);
    });
  });

  describe('errorResponseWithFallback', () => {
    const errorBody = {
      error: {
        message: 'Test error',
        description: 'Test description',
      },
    };

    it('uses NextResponse.json when available', () => {
      const mockJson = jest.fn().mockReturnValue('error json response');
      NextResponse.json = mockJson;

      const result = errorResponseWithFallback(errorBody);

      expect(mockJson).toHaveBeenCalledWith(errorBody, { status: 500 });
      expect(result).toBe('error json response');
    });

    it('falls back to standard Response when NextResponse is not available', () => {
      const originalJson = NextResponse.json;

      // @ts-expect-error - This is to test the fallback
      delete NextResponse.json;

      const result = errorResponseWithFallback(errorBody);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(500);
      expect(result.headers.get('Content-Type')).toBe('application/json');

      NextResponse.json = originalJson;
    });

    it('falls back to standard Response when NextResponse exists but json is undefined', async () => {
      jest.resetModules();

      jest.mock('next/server', () => ({
        NextResponse: {
          // exists but has no json method
        },
      }));

      const { errorResponseWithFallback } = await import('../src/utils.js');

      const result = errorResponseWithFallback(errorBody);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(500);
      expect(result.headers.get('Content-Type')).toBe('application/json');
    });

    it('falls back to standard Response when NextResponse is undefined', async () => {
      jest.resetModules();

      jest.mock('next/server', () => ({
        NextResponse: undefined,
      }));

      const { errorResponseWithFallback } = await import('../src/utils.js');

      const result = errorResponseWithFallback(errorBody);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(500);
      expect(result.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
