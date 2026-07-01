export interface AuthKitConfig {
  /** WorkOS API key. Overrides `WORKOS_API_KEY`. Applied once at client creation. */
  apiKey?: string;
  /** WorkOS client ID. Overrides `WORKOS_CLIENT_ID`. */
  clientId?: string;
  /** Secret used to seal/unseal session cookies. At least 32 characters. Overrides `WORKOS_COOKIE_PASSWORD`. */
  cookiePassword?: string;
  /** OAuth redirect URI. Overrides `NEXT_PUBLIC_WORKOS_REDIRECT_URI`. */
  redirectUri?: string;
  /** Session cookie name. Defaults to `wos-session`. Overrides `WORKOS_COOKIE_NAME`. */
  cookieName?: string;
  /** Cookie `Domain` attribute. Overrides `WORKOS_COOKIE_DOMAIN`. */
  cookieDomain?: string;
  /** Cookie `Max-Age` in seconds. Defaults to 400 days. Overrides `WORKOS_COOKIE_MAX_AGE`. */
  cookieMaxAge?: number;
  /** Cookie `SameSite` attribute. Defaults to `lax`. Overrides `WORKOS_COOKIE_SAMESITE`. */
  cookieSameSite?: 'lax' | 'strict' | 'none';
  /** One-shot environment claim token. Overrides `WORKOS_CLAIM_TOKEN`. */
  claimToken?: string;
  /** Custom WorkOS API hostname. Overrides `WORKOS_API_HOSTNAME`. Applied once at client creation. */
  apiHostname?: string;
  /** Whether to use HTTPS for the WorkOS API. Defaults to `true`. Overrides `WORKOS_API_HTTPS`. Applied once at client creation. */
  apiHttps?: boolean;
  /** Custom WorkOS API port. Overrides `WORKOS_API_PORT`. Applied once at client creation. */
  apiPort?: number;
}

const OVERRIDES_KEY = Symbol.for('workos.authkit.overrides');

const _overrides: AuthKitConfig = ((globalThis as Record<symbol, AuthKitConfig | undefined>)[OVERRIDES_KEY] ??= {});

/**
 * Configure AuthKit with values from any source (secrets manager, vault, etc.)
 * as an alternative to environment variables. Successive calls are merged, so
 * you can call this multiple times to set different groups of values.
 *
 * **Call this before any other AuthKit function.** API connection settings
 * (`apiKey`, `apiHostname`, `apiHttps`, `apiPort`) are applied when the WorkOS
 * client is first created and cannot be updated afterwards. All other settings
 * are read on every request, so they can technically be set later, but
 * calling this once at startup is the intended usage.
 *
 * @example
 * ```ts
 * import { initAuthKit } from '@workos-inc/authkit-nextjs';
 *
 * initAuthKit({
 *   apiKey: await secrets.get('WORKOS_API_KEY'),
 *   clientId: await secrets.get('WORKOS_CLIENT_ID'),
 *   cookiePassword: await secrets.get('WORKOS_COOKIE_PASSWORD'),
 *   redirectUri: 'https://myapp.com/callback',
 * });
 * ```
 */
export function initAuthKit(overrides: AuthKitConfig): void {
  Object.assign(_overrides, overrides);
}

export const config = {
  get apiKey(): string {
    return _overrides.apiKey ?? process.env.WORKOS_API_KEY ?? '';
  },
  get clientId(): string {
    return _overrides.clientId ?? process.env.WORKOS_CLIENT_ID ?? '';
  },
  get cookiePassword(): string {
    return _overrides.cookiePassword ?? process.env.WORKOS_COOKIE_PASSWORD ?? '';
  },
  get redirectUri(): string {
    return _overrides.redirectUri ?? process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? '';
  },
  get cookieName(): string | undefined {
    return _overrides.cookieName ?? process.env.WORKOS_COOKIE_NAME;
  },
  get cookieDomain(): string | undefined {
    return _overrides.cookieDomain ?? process.env.WORKOS_COOKIE_DOMAIN;
  },
  get cookieMaxAge(): number | undefined {
    if (_overrides.cookieMaxAge !== undefined) return _overrides.cookieMaxAge;
    const raw = process.env.WORKOS_COOKIE_MAX_AGE;
    if (!raw) return undefined;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
  get cookieSameSite(): 'lax' | 'strict' | 'none' | undefined {
    return _overrides.cookieSameSite ?? (process.env.WORKOS_COOKIE_SAMESITE as 'lax' | 'strict' | 'none' | undefined);
  },
  get claimToken(): string | undefined {
    return _overrides.claimToken ?? process.env.WORKOS_CLAIM_TOKEN;
  },
  get apiHostname(): string | undefined {
    return _overrides.apiHostname ?? process.env.WORKOS_API_HOSTNAME;
  },
  get apiHttps(): boolean {
    if (_overrides.apiHttps !== undefined) return _overrides.apiHttps;
    const raw = process.env.WORKOS_API_HTTPS;
    return raw ? raw === 'true' : true;
  },
  get apiPort(): number | undefined {
    if (_overrides.apiPort !== undefined) return _overrides.apiPort;
    const raw = process.env.WORKOS_API_PORT;
    if (!raw) return undefined;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
};
