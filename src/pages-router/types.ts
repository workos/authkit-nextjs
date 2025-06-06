import type { NextApiRequest, NextApiResponse } from 'next';
import type { Session as AuthKitSession } from '@workos-inc/authkit-ssr';

// Pages Router specific Session type extending authkit-ssr Session
export interface Session extends AuthKitSession {
  sessionId?: string;
  organizationId?: string;
  role?: string;
  permissions?: string[];
  entitlements?: string[];
}

// Pages Router specific types
export interface GetServerSidePropsContextWithAuth<Q extends Record<string, string> = Record<string, string>> {
  req: NextApiRequest;
  res: NextApiResponse;
  query: Q;
  params?: Q;
  resolvedUrl: string;
  locale?: string;
  locales?: string[];
  defaultLocale?: string;
  preview?: boolean;
  previewData?: unknown;
  auth: Session | null;
}

export interface ApiRouteRequestWithAuth extends NextApiRequest {
  auth: Session | null;
}

export interface WithAuthOptions {
  ensureSignedIn?: boolean;
  returnToPath?: string;
}

export interface BuildWorkOSPropsOptions {
  session: Session | null;
}

// Re-export interfaces from main package to maintain compatibility
export {
  type HandleAuthOptions,
  type HandleAuthSuccessData,
  type Impersonator,
  type UserInfo,
  type NoUserInfo,
  type AccessToken,
  type GetAuthURLOptions,
} from '../interfaces.js';