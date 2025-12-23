import type { Session } from './interfaces.js';
import { decodeJwt } from './jwt.js';

export class AuthKitError extends Error {
  data?: Record<string, unknown>;

  constructor(message: string, cause?: unknown, data?: Record<string, unknown>) {
    super(message);
    this.name = 'AuthKitError';
    this.cause = cause;
    this.data = data;
  }
}

export interface TokenRefreshErrorContext {
  userId?: string;
  sessionId?: string;
}

export class TokenRefreshError extends AuthKitError {
  readonly userId?: string;
  readonly sessionId?: string;

  constructor(message: string, cause?: unknown, context?: TokenRefreshErrorContext) {
    super(message, cause);
    this.name = 'TokenRefreshError';
    this.userId = context?.userId;
    this.sessionId = context?.sessionId;
  }
}

export function getSessionErrorContext(session?: Session | null): TokenRefreshErrorContext {
  if (!session?.accessToken) {
    return {};
  }

  try {
    const { payload } = decodeJwt(session.accessToken);
    return {
      userId: payload.sub,
      sessionId: payload.sid,
    };
  } catch {
    return {};
  }
}
