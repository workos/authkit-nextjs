import { useMemo } from 'react';
import { useAccessToken } from './useAccessToken.js';
import { decodeJwt } from 'jose';

/**
 * Extracts custom claims from the access token.
 * @returns The custom claims as a record of key-value pairs.
 */
export function useCustomClaims<T = Record<string, unknown>>() {
  const { accessToken } = useAccessToken();

  return useMemo(() => {
    if (!accessToken) {
      return null;
    }

    const decoded = decodeJwt(accessToken);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { aud, exp, iat, iss, sub, sid, org_id, role, permissions, entitlements, jti, nbf, ...custom } = decoded;

    return custom as T;
  }, [accessToken]);
}
