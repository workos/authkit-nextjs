import type { BuildWorkOSPropsOptions, Session } from '../types.js';

/**
 * Builds props to pass WorkOS auth state to client components
 * Serializes the session for client hydration
 * @param options Configuration options including the session
 * @returns Serializable props for Next.js pages
 */
export function buildWorkOSProps(options: BuildWorkOSPropsOptions): {
  __workos_ssr_state: {
    accessToken: string;
    refreshToken: string;
    user: Session['user'];
    impersonator: Session['impersonator'] | null;
  } | null;
} {
  const { session } = options;
  
  // Return props in a format that matches the existing pattern
  return {
    __workos_ssr_state: session ? {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
      impersonator: session.impersonator || null,
    } : null,
  };
}