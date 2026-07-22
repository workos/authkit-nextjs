import type { AuthenticationResponse, OauthTokens, User, WorkOS } from '@workos-inc/node';
import { type NextRequest } from 'next/server';
import * as v from 'valibot';

/**
 * The options object accepted by the installed SDK's `getAuthorizationUrl`.
 *
 * Derived from the method authkit already calls at runtime rather than from a
 * named type import, so the version gate below never depends on whether a given
 * `@workos-inc/node` release exports its options type by name — it only needs
 * the method to exist, which it does across the entire peer range. `keyof` is
 * read from the consumer's installed version at *their* compile time, so the
 * surface tracks the peer.
 */
type SdkAuthorizationUrlOptions = Parameters<WorkOS['userManagement']['getAuthorizationUrl']>[0];

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
  state?: string | undefined;
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
  authenticationMethod?: AuthenticationResponse['authenticationMethod'];
}

export interface UserInfo {
  user: User;
  sessionId: string;
  organizationId?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  entitlements?: string[];
  featureFlags?: string[];
  impersonator?: Impersonator;
  accessToken: string;
}
export interface NoUserInfo {
  user: null;
  sessionId?: undefined;
  organizationId?: undefined;
  role?: undefined;
  roles?: undefined;
  permissions?: undefined;
  entitlements?: undefined;
  featureFlags?: undefined;
  impersonator?: undefined;
  accessToken?: undefined;
}

export interface AccessToken {
  /**
   * The subject of the token — the WorkOS user id the access token was issued
   * for. Always present on a signature-verified WorkOS access token; used to
   * bind the sealed session `user` to the token in `withAuth`.
   */
  sub?: string;
  sid: string;
  org_id?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  entitlements?: string[];
  feature_flags?: string[];
}

export const StateSchema = v.object({
  nonce: v.string(),
  customState: v.optional(v.string()),
  returnPathname: v.optional(v.string()),
  codeVerifier: v.string(),
});

export type State = v.InferOutput<typeof StateSchema>;

export interface GetAuthURLResult {
  url: string;
  sealedState: string;
}

export interface GetAuthURLOptions {
  screenHint?: 'sign-up' | 'sign-in';
  returnPathname?: string;
  organizationId?: string;
  redirectUri?: string;
  loginHint?: string;
  prompt?: 'consent';
  state?: string;
  /**
   * Maximum allowable elapsed time, in seconds, since the user last actively
   * authenticated (OIDC `max_age`).
   *
   * Requires `@workos-inc/node` >= 10.7.0, where the param was added.
   */
  maxAge?: 'maxAge' extends keyof SdkAuthorizationUrlOptions ? number : never;
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
  eagerAuth?: boolean;
  /**
   * Number of seconds before access token expiry at which the proxy/middleware
   * proactively refreshes the session, so server-side consumers of the access
   * token never receive a token that expires mid-request.
   *
   * Defaults to the same buffer the client token store uses: 60 seconds, or 30
   * seconds for tokens with a total lifetime of 5 minutes or less. Set to `0`
   * to disable proactive refresh and only refresh once the token has expired.
   */
  refreshBufferSeconds?: number;
}

export interface AuthkitOptions {
  eagerAuth?: boolean;
  debug?: boolean;
  redirectUri?: string;
  screenHint?: 'sign-up' | 'sign-in';
  /**
   * Number of seconds before access token expiry at which the session is
   * proactively refreshed. Defaults to 60 seconds (30 seconds for tokens with
   * a total lifetime of 5 minutes or less). Set to `0` to disable.
   */
  refreshBufferSeconds?: number;
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
