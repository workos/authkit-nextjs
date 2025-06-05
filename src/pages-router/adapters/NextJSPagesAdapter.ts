import type { NextApiRequest, NextApiResponse } from 'next';
import { getCookieOptions } from '../../cookie.js';
import { WORKOS_COOKIE_NAME } from '../../env-variables.js';
import { encryptSession, decryptSession, parseAccessToken } from '../config.js';
import type { Session } from '../types.js';

/**
 * NextJS Pages Router session management
 * Handles cookie reading from NextApiRequest and writing to NextApiResponse
 */
export class NextJSPagesAdapter {
  private cookieName: string;

  constructor(cookieName?: string) {
    this.cookieName = cookieName || WORKOS_COOKIE_NAME || 'wos-authkit';
  }

  async getCookie(req: NextApiRequest): Promise<string | undefined> {
    // In Pages Router, cookies are available in req.cookies
    return req.cookies[this.cookieName];
  }

  async setCookie(res: NextApiResponse, value: string): Promise<void> {
    // Get cookie options that match existing implementation
    const cookieOptions = getCookieOptions();
    
    // Build cookie string for Set-Cookie header
    const cookieParts = [
      `${this.cookieName}=${value}`,
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

    if (cookieOptions.domain) {
      cookieParts.push(`Domain=${cookieOptions.domain}`);
    }

    // Set the cookie header
    res.setHeader('Set-Cookie', cookieParts.join('; '));
  }

  async deleteCookie(res: NextApiResponse): Promise<void> {
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

    if (cookieOptions.domain) {
      cookieParts.push(`Domain=${cookieOptions.domain}`);
    }

    // Set the expired cookie
    res.setHeader('Set-Cookie', cookieParts.join('; '));
  }

  async getSession(req: NextApiRequest): Promise<Session | null> {
    const sessionCookie = await this.getCookie(req);
    if (!sessionCookie) {
      return null;
    }

    const session = await decryptSession(sessionCookie);
    if (!session) {
      return null;
    }

    // Parse additional data from access token
    const tokenData = parseAccessToken(session.accessToken);
    
    return {
      ...session,
      ...tokenData,
    };
  }

  async saveSession(res: NextApiResponse, session: Session): Promise<void> {
    const encryptedSession = await encryptSession(session);
    await this.setCookie(res, encryptedSession);
  }
}