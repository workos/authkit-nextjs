import type { AuthenticationResponse, OauthTokens, User } from '@workos-inc/node';
import { type NextRequest } from 'next/server';

export interface HandleAuthOptions {
  returnPathname?: string;
  baseURL?: string;
  onSuccess?: (data: HandleAuthSuccessData) => void | Promise<void>;
  onError?: (params: { error?: unknown; request: NextRequest }) => Response | Promise<Response>;
}

export interface HandleAuthSuccessData extends Session {
  oauthTokens?: OauthTokens;
  organizationId?: string;
  authenticationMethod?: AuthenticationResponse['authenticationMethod'];
}

export interface Impersonator {
  email: string;
  reason: string | null;
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  impersonator?: Impersonator;
}

export interface UserInfo {
  user: User;
  sessionId: string;
  organizationId?: string;
  role?: string;
  permissions?: string[];
  entitlements?: string[];
  impersonator?: Impersonator;
  accessToken: string;
}
export interface NoUserInfo {
  user: null;
  sessionId?: undefined;
  organizationId?: undefined;
  role?: undefined;
  permissions?: undefined;
  entitlements?: undefined;
  impersonator?: undefined;
  accessToken?: undefined;
}

export interface AccessToken {
  sid: string;
  org_id?: string;
  role?: string;
  permissions?: string[];
  entitlements?: string[];
}

export interface GetAuthURLOptions {
  screenHint?: 'sign-up' | 'sign-in';
  returnPathname?: string;
  organizationId?: string;
  redirectUri?: string;
  loginHint?: string;
}

export interface AuthkitMiddlewareAuth {
  enabled: boolean;
  unauthenticatedPaths: string[];
}

export interface AuthkitMiddlewareOptions {
  debug?: boolean;
  middlewareAuth?: AuthkitMiddlewareAuth;
  redirectUri?: string;
  signUpPaths?: string[];
}

export interface AuthkitOptions {
  debug?: boolean;
  redirectUri?: string;
  screenHint?: 'sign-up' | 'sign-in';
  onSessionRefreshSuccess?: (data: {
    accessToken: string;
    user: User;
    impersonator?: Impersonator;
    organizationId?: string;
  }) => void | Promise<void>;
  onSessionRefreshError?: (params: { error?: unknown; request: NextRequest }) => void | Promise<void>;
}

export interface AuthkitResponse {
  session: UserInfo | NoUserInfo;
  headers: Headers;
  authorizationUrl?: string;
}

export interface CookieOptions {
  path: '/';
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
  domain: string | undefined;
}

export interface SwitchToOrganizationOptions {
  returnTo?: string;
  revalidationStrategy?: 'none' | 'tag' | 'path';
  revalidationTags?: string[];
}
