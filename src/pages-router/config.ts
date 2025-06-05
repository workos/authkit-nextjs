// Since authkit-ssr is in alpha, let's implement our own session handling
// that reuses the existing session logic from the main package

import { sealData, unsealData } from 'iron-session';
import { decodeJwt } from 'jose';
import { WORKOS_COOKIE_PASSWORD } from '../env-variables.js';
import type { Session, AccessToken } from '../interfaces.js';

export async function encryptSession(session: Session): Promise<string> {
  return sealData(session, {
    password: WORKOS_COOKIE_PASSWORD,
    ttl: 0,
  });
}

export async function decryptSession(encryptedSession: string): Promise<Session | null> {
  try {
    return await unsealData<Session>(encryptedSession, {
      password: WORKOS_COOKIE_PASSWORD,
      ttl: 0,
    });
  } catch {
    return null;
  }
}

export function parseAccessToken(accessToken: string) {
  try {
    const payload = decodeJwt<AccessToken>(accessToken);
    return {
      sessionId: payload.sid,
      organizationId: payload.org_id,
      role: payload.role,
      permissions: payload.permissions,
      entitlements: payload.entitlements,
    };
  } catch {
    return {
      sessionId: undefined,
      organizationId: undefined,
      role: undefined,
      permissions: undefined,
      entitlements: undefined,
    };
  }
}