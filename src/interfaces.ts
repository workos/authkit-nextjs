import { User } from '@workos-inc/node';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface UserInfo {
  user: User;
  organizationId: string;
  sessionId: string;
  role?: string;
}
export interface NoUserInfo {
  user: null;
  organizationId?: undefined;
  sessionId?: undefined;
  role?: undefined;
}

export interface AccessToken {
  sid: string;
  org_id: string;
  role?: string;
}
