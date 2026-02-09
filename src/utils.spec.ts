import { NextResponse } from 'next/server';
import { redirectWithFallback, errorResponseWithFallback } from './utils.js';

describe('utils', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('redirectWithFallback', () => {
    it('uses NextResponse.redirect when available', () => {
      const redirectUrl = 'https://example.com';
      const mockRedirect = vi.fn().mockReturnValue('redirected');

      vi.spyOn(NextResponse, 'redirect').mockImplementation(mockRedirect);

      const result = redirectWithFallback(redirectUrl);

      expect(mockRedirect).toHaveBeenCalledWith(redirectUrl, { headers: undefined });
      expect(result).toBe('redirected');
    });

    it('uses headers when provided', () => {
      const redirectUrl = 'https://example.com';
      const headers = new Headers();
      headers.set('Set-Cookie', 'test=1');

      const result = redirectWithFallback(redirectUrl, headers);

      expect(result.headers.get('Set-Cookie')).toBe('test=1');
    });

    it('falls back to standard Response when NextResponse exists but redirect is undefined', async () => {
      const redirectUrl = 'https://example.com';

      vi.resetModules();

      vi.doMock('next/server', () => ({
        NextResponse: {
          // exists but has no redirect method
        },
      }));

      const { redirectWithFallback } = await import('./utils.js');

      const result = redirectWithFallback(redirectUrl);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(307);
      expect(result.headers.get('Location')).toBe(redirectUrl);
    });

    it('falls back to standard Response when NextResponse is undefined', async () => {
      const redirectUrl = 'https://example.com';

      vi.resetModules();

      // Mock with undefined NextResponse
      vi.doMock('next/server', () => ({
        NextResponse: undefined,
      }));

      const { redirectWithFallback } = await import('./utils.js');

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
      const mockJson = vi.fn().mockReturnValue('error json response');
      vi.spyOn(NextResponse, 'json').mockImplementation(mockJson);

      const result = errorResponseWithFallback(errorBody);

      expect(mockJson).toHaveBeenCalledWith(errorBody, { status: 500 });
      expect(result).toBe('error json response');
    });

    it('falls back to standard Response when NextResponse exists but json is undefined', async () => {
      vi.resetModules();

      vi.doMock('next/server', () => ({
        NextResponse: {
          // exists but has no json method
        },
      }));

      const { errorResponseWithFallback } = await import('./utils.js');

      const result = errorResponseWithFallback(errorBody);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(500);
      expect(result.headers.get('Content-Type')).toBe('application/json');
    });

    it('falls back to standard Response when NextResponse is undefined', async () => {
      vi.resetModules();

      vi.doMock('next/server', () => ({
        NextResponse: undefined,
      }));

      const { errorResponseWithFallback } = await import('./utils.js');

      const result = errorResponseWithFallback(errorBody);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(500);
      expect(result.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
