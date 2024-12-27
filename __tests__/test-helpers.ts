import { SignJWT } from 'jose';

export async function generateTestToken(payload = {}, expired = false) {
  const defaultPayload = {
    sid: 'session_123',
    org_id: 'org_123',
    role: 'member',
    permissions: ['posts:create', 'posts:delete'],
    entitlements: ['audit-logs'],
  };

  const mergedPayload = { ...defaultPayload, ...payload };

  const secret = new TextEncoder().encode(process.env.WORKOS_COOKIE_PASSWORD as string);

  const token = await new SignJWT(mergedPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('urn:example:issuer')
    .setExpirationTime(expired ? '0s' : '2h')
    .sign(secret);

  return token;
}
