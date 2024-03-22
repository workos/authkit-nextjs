import { User } from '@workos-inc/node';

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
  impersonator?: Impersonator;
}
export interface NoUserInfo {
  user: null;
  sessionId?: undefined;
  organizationId?: undefined;
  role?: undefined;
  impersonator?: undefined;
}

export interface AccessToken {
  sid: string;
  org_id?: string;
  role?: string;
}
