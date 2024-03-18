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
}
export interface NoUserInfo {
  user: null;
  sessionId?: undefined;
}

export interface AccessToken {
  sid: string;
  org_id: string;
}
