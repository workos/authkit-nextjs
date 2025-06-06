import type { NextApiRequest, NextApiResponse } from 'next';
import { SessionStorage, getConfig, type AuthKitConfig } from '@workos-inc/authkit-ssr';
import { getCookieOptions } from '../../cookie.js';
import { WORKOS_COOKIE_NAME } from '../../env-variables.js';

/**
 * NextJS Pages Router session storage adapter for authkit-ssr
 * Implements the SessionStorage interface for Next.js Pages Router
 */
export class NextJSPagesAdapter implements SessionStorage<NextApiRequest, NextApiResponse> {
  private cookieName: string;

  constructor(config?: AuthKitConfig) {
    this.cookieName = config?.cookieName || WORKOS_COOKIE_NAME || 'wos-session';
  }

  async getSession(req: NextApiRequest): Promise<string | null> {
    // In Pages Router, cookies are available in req.cookies
    return req.cookies[this.cookieName] || null;
  }

  async saveSession(res: NextApiResponse, sessionData: string): Promise<NextApiResponse> {
    // Get cookie options that match existing implementation
    const cookieOptions = getCookieOptions();
    
    // Build cookie string for Set-Cookie header
    const cookieParts = [
      `${this.cookieName}=${sessionData}`,
      `Path=${cookieOptions.path}`,
      'HttpOnly',
    ];

    if (cookieOptions.secure) {
      cookieParts.push('Secure');
    }

    if (cookieOptions.sameSite) {
      cookieParts.push(`SameSite=${cookieOptions.sameSite}`);
    }

    if (cookieOptions.maxAge) {
      cookieParts.push(`Max-Age=${cookieOptions.maxAge}`);
    }

    if (cookieOptions.domain && cookieOptions.domain !== '') {
      cookieParts.push(`Domain=${cookieOptions.domain}`);
    }

    // Set the cookie header
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    return res;
  }

  async clearSession(res: NextApiResponse): Promise<NextApiResponse> {
    // Get expired cookie options
    const cookieOptions = getCookieOptions(null, false, true);
    
    // Build expired cookie string
    const cookieParts = [
      `${this.cookieName}=`,
      `Path=${cookieOptions.path}`,
      'HttpOnly',
      'Max-Age=0',
    ];

    if (cookieOptions.secure) {
      cookieParts.push('Secure');
    }

    if (cookieOptions.sameSite) {
      cookieParts.push(`SameSite=${cookieOptions.sameSite}`);
    }

    if (cookieOptions.domain && cookieOptions.domain !== '') {
      cookieParts.push(`Domain=${cookieOptions.domain}`);
    }

    // Set the expired cookie
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    return res;
  }
}