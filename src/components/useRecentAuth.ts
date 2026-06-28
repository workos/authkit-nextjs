'use client';

import { evaluateRecentAuth } from '../utils.js';
import { useAccessToken } from './useAccessToken.js';
import { useTokenClaims } from './useTokenClaims.js';

/**
 * Reports how recently the current user authenticated, from the `auth_time`
 * claim already held in client memory. Presentation only — enforce recency
 * server-side with `checkRecentAuth`.
 */
export function useRecentAuth({ maxAge }: { maxAge: number }) {
  const { loading } = useAccessToken();
  const { auth_time } = useTokenClaims();

  if (loading) {
    return {
      loading: true,
      authenticatedAt: undefined,
      isStale: undefined,
    } as const;
  }

  const recentAuth = evaluateRecentAuth({
    authTime: auth_time,
    maxAgeSeconds: maxAge,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  return { ...recentAuth, loading } as const;
}
