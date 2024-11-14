import { OauthTokens, User } from '@workos-inc/node';

export interface HandleAuthOptions {
  returnPathname?: string;
  baseURL?: string;
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
  oauthTokens?: OauthTokens;
}

export interface UserInfo {
  user: User;
  sessionId: string;
  organizationId?: string;
  role?: string;
  permissions?: string[];
  impersonator?: Impersonator;
  oauthTokens?: OauthTokens;
  accessToken: string;
}
export interface NoUserInfo {
  user: null;
  sessionId?: undefined;
  organizationId?: undefined;
  role?: undefined;
  permissions?: undefined;
  impersonator?: undefined;
  oauthTokens?: undefined;
  accessToken?: undefined;
}

export interface AccessToken {
  sid: string;
  org_id?: string;
  role?: string;
  permissions?: string[];
}

export interface GetAuthURLOptions {
  screenHint?: 'sign-up' | 'sign-in';
  returnPathname?: string;
  organizationId?: string;
  redirectUri?: string;
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

export interface CookieOptions {
  path: '/';
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  domain: string | undefined;
}
