/**
 * JWT (JSON Web Token) Interface Definitions
 */
export interface JWTHeader {
  'alg': string;
  'typ'?: string | undefined;
  'cty'?: string | undefined;
  'crit'?: Array<string | Exclude<keyof JWTHeader, 'crit'>> | undefined;
  'kid'?: string | undefined;
  'jku'?: string | undefined;
  'x5u'?: string | string[] | undefined;
  'x5t#S256'?: string | undefined;
  'x5t'?: string | undefined;
  'x5c'?: string | string[] | undefined;
}
/**
 * JWT Payload Interface
 */
export interface JWTPayload {
  /**
   * Session ID of the JWT, used to identify the session
   */
  sid: string;

  /**
   * Issuer of the JWT
   */
  iss: string;
  /**
   * Subject of the JWT
   */
  sub: string;
  /**
   * Audience of the JWT, can be a single string or an array of strings
   */
  aud?: string | string[];
  /**
   * Expiration time of the JWT, represented as a Unix timestamp
   */
  exp: number;
  /**
   * Issued at time of the JWT, represented as a Unix timestamp
   */
  iat: number;
  /**
   * JWT ID, a unique identifier for the JWT
   */
  jti: string;

  /**
   * Organization ID associated with the JWT
   */
  org_id?: string;

  /**
   * Role of the user associated with the JWT
   */
  role?: string;

  /**
   * Roles of the user associated with the JWT
   */
  roles?: string[];

  /**
   * Permissions granted to the user associated with the JWT
   */
  permissions?: string[];
}

export type TokenClaims<T> = Partial<JWTPayload & T>;

/**
 * Decodes a base64url encoded string
 * @param input The base64url string to decode
 * @returns The decoded string
 */
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(base64 + padding);
}

/**
 * Decodes a JWT token and returns its header and payload
 * @param token The JWT token to decode
 * @return An object containing the decoded header and payload
 * @throws Error if the token is not in a valid JWT format or if decoding fails
 */
// should replace this with jose if we ever need to verify the JWT
export function decodeJwt<T = Record<string, unknown>>(
  token: string,
): {
  header: JWTHeader;
  payload: TokenClaims<T>;
} {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  try {
    const header = JSON.parse(decodeBase64Url(parts[0])) as JWTHeader;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as JWTPayload & T;

    return { header, payload };
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : String(error)}`);
  }
}
