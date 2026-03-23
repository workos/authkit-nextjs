import {
  checkSessionAction,
  handleSignOutAction,
  getOrganizationAction,
  getAuthAction,
  refreshAuthAction,
  switchToOrganizationAction,
  getAccessTokenAction,
  refreshAccessTokenAction,
} from '../src/actions.js';
import { signOut, switchToOrganization } from './auth.js';
import { getWorkOS } from '../src/workos.js';
import { withAuth, refreshSession } from '../src/session.js';
import { getAuthorizationUrl } from '../src/get-authorization-url.js';

vi.mock('../src/auth.js', () => ({
  signOut: vi.fn().mockResolvedValue(true),
  switchToOrganization: vi.fn().mockResolvedValue({ organizationId: 'org_123' }),
}));

const { fakeWorkosInstance } = vi.hoisted(() => ({
  fakeWorkosInstance: {
    organizations: {
      getOrganization: vi.fn().mockResolvedValue({ id: 'org_123', name: 'Test Org' }),
    },
  },
}));
vi.mock('../src/workos.js', () => ({
  getWorkOS: vi.fn(() => fakeWorkosInstance),
}));

vi.mock('../src/session.js', () => ({
  withAuth: vi.fn().mockResolvedValue({ user: 'testUser', accessToken: 'access_token' }),
  refreshSession: vi.fn().mockResolvedValue({ user: 'testUser', accessToken: 'refreshed_token' }),
}));

vi.mock('../src/get-authorization-url.js', () => ({
  getAuthorizationUrl: vi.fn().mockResolvedValue('https://api.workos.com/authorize?...'),
}));

describe('actions', () => {
  const workos = getWorkOS();

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock implementations
    vi.mocked(withAuth).mockResolvedValue({ user: 'testUser' as never, sessionId: 'session_123', accessToken: 'access_token' });
    vi.mocked(refreshSession).mockResolvedValue({ user: 'testUser' as never, sessionId: 'session_123', accessToken: 'refreshed_token' });
  });

  describe('checkSessionAction', () => {
    it('should return true for authenticated users', async () => {
      const result = await checkSessionAction();
      expect(result).toBe(true);
    });
  });

  describe('handleSignOutAction', () => {
    it('should call signOut', async () => {
      await handleSignOutAction();
      expect(signOut).toHaveBeenCalled();
    });
  });

  describe('getOrganizationAction', () => {
    it('should return organization details', async () => {
      const organizationId = 'org_123';
      const result = await getOrganizationAction(organizationId);
      expect(workos.organizations.getOrganization).toHaveBeenCalledWith(organizationId);
      expect(result).toEqual({ id: 'org_123', name: 'Test Org' });
    });
  });

  describe('getAuthAction', () => {
    it('should return auth details', async () => {
      const result = await getAuthAction();
      expect(withAuth).toHaveBeenCalled();
      expect(result).toEqual({ user: 'testUser', sessionId: 'session_123' });
    });

    it('should not pass ensureSignedIn to withAuth', async () => {
      await getAuthAction({ ensureSignedIn: true });
      expect(withAuth).toHaveBeenCalledWith();
    });

    it('should return signInUrl when ensureSignedIn is true and no user', async () => {
      vi.mocked(withAuth).mockResolvedValueOnce({ user: null });
      const result = await getAuthAction({ ensureSignedIn: true });
      expect(getAuthorizationUrl).toHaveBeenCalledWith({ screenHint: 'sign-in' });
      expect(result).toEqual({ user: null, signInUrl: 'https://api.workos.com/authorize?...' });
    });

    it('should not return signInUrl when ensureSignedIn is true and user exists', async () => {
      const result = await getAuthAction({ ensureSignedIn: true });
      expect(getAuthorizationUrl).not.toHaveBeenCalled();
      expect(result).toEqual({ user: 'testUser', sessionId: 'session_123' });
    });
  });

  describe('refreshAuthAction', () => {
    it('should refresh session', async () => {
      const params = { ensureSignedIn: false, organizationId: 'org_123' };
      const result = await refreshAuthAction(params);
      expect(refreshSession).toHaveBeenCalledWith({ organizationId: 'org_123' });
      expect(result).toEqual({ user: 'testUser', sessionId: 'session_123' });
    });

    it('should not pass ensureSignedIn to refreshSession', async () => {
      await refreshAuthAction({ ensureSignedIn: true, organizationId: 'org_123' });
      expect(refreshSession).toHaveBeenCalledWith({ organizationId: 'org_123' });
    });

    it('should return signInUrl when ensureSignedIn is true and no user', async () => {
      vi.mocked(refreshSession).mockResolvedValueOnce({ user: null });
      const result = await refreshAuthAction({ ensureSignedIn: true });
      expect(getAuthorizationUrl).toHaveBeenCalledWith({ screenHint: 'sign-in' });
      expect(result).toEqual({ user: null, signInUrl: 'https://api.workos.com/authorize?...' });
    });

    it('should not return signInUrl when ensureSignedIn is true and user exists', async () => {
      const result = await refreshAuthAction({ ensureSignedIn: true });
      expect(getAuthorizationUrl).not.toHaveBeenCalled();
      expect(result).toEqual({ user: 'testUser', sessionId: 'session_123' });
    });
  });

  describe('switchToOrganizationAction', () => {
    it('should switch organizations', async () => {
      const options = { returnTo: '/test' };
      const result = await switchToOrganizationAction('org_123', options);
      expect(switchToOrganization).toHaveBeenCalledWith('org_123', options);
      expect(result).toEqual({ organizationId: 'org_123' });
    });
  });

  describe('getAccessTokenAction', () => {
    it('should return access token', async () => {
      const result = await getAccessTokenAction();
      expect(withAuth).toHaveBeenCalled();
      expect(result).toEqual('access_token');
    });
  });

  describe('refreshAccessTokenAction', () => {
    it('should refresh access token', async () => {
      const result = await refreshAccessTokenAction();
      expect(refreshSession).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'refreshed_token' });
    });

    it('should catch errors and return a generic error instead of throwing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(refreshSession).mockRejectedValueOnce(new Error('Rate limit exceeded'));
      const result = await refreshAccessTokenAction();
      expect(result).toEqual({ accessToken: undefined, error: 'Failed to refresh access token' });
      expect(warnSpy).toHaveBeenCalledWith('Failed to refresh access token:', 'Rate limit exceeded');
      warnSpy.mockRestore();
    });

    it('should handle non-Error objects in catch', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(refreshSession).mockRejectedValueOnce('string error');
      const result = await refreshAccessTokenAction();
      expect(result).toEqual({ accessToken: undefined, error: 'Failed to refresh access token' });
      expect(warnSpy).toHaveBeenCalledWith('Failed to refresh access token:', 'string error');
      warnSpy.mockRestore();
    });
  });
});
