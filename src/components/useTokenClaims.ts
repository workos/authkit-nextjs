import { useMemo } from 'react';
import { useAccessToken } from './useAccessToken.js';
import { decodeJwt, type TokenClaims } from '../jwt.js';

/**
 * A hook that retrieves the claims from the access token.
 *
 * @example
 * ```ts
 * const {customClaim, iat } = useTokenClaims<{ customClaim: string }>();
 * ```
 * @returns The claims from the access token, or an empty object if the token is not available or cannot be parsed.
 */
export function useTokenClaims<T = Record<string, unknown>>(): TokenClaims<T> {
  const { accessToken } = useAccessToken();

  return useMemo(() => {
    if (!accessToken) {
      return {};
    }

    try {
      return decodeJwt<T>(accessToken).payload;
    } catch {
      return {};
    }
  }, [accessToken]);
}
