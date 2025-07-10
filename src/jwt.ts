import type { JWTPayload } from './interfaces.js';

export type TokenClaims<T> = Partial<JWTPayload & T>;

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  str += '='.repeat((4 - (str.length % 4)) % 4);

  return atob(str);
}

/**
 * Parses a JWT token and extracts its claims.
 * @param token - The JWT token as a string.
 * @return An object containing the claims from the token.
 */
export function parseToken<T = Record<string, unknown>>(token: string | undefined): TokenClaims<T> {
  if (!token) {
    return {};
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const payload: TokenClaims<T> = JSON.parse(base64UrlDecode(parts[1]));
  return payload;
}
