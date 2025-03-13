import {
  checkSessionAction,
  handleSignOutAction,
  getOrganizationAction,
  getAuthAction,
  refreshAuthAction,
  switchToOrganizationAction,
} from '../src/actions.js';
import { signOut, switchToOrganization } from '../src/auth.js';
import { getWorkOS } from '../src/workos.js';
import { withAuth, refreshSession } from '../src/session.js';

jest.mock('../src/auth.js', () => ({
  signOut: jest.fn().mockResolvedValue(true),
  switchToOrganization: jest.fn().mockResolvedValue({ organizationId: 'org_123' }),
}));

const fakeWorkosInstance = {
  organizations: {
    getOrganization: jest.fn().mockResolvedValue({ id: 'org_123', name: 'Test Org' }),
  },
};
jest.mock('../src/workos.js', () => ({
  getWorkOS: jest.fn(() => fakeWorkosInstance),
}));

jest.mock('../src/session.js', () => ({
  withAuth: jest.fn().mockResolvedValue({ user: 'testUser' }),
  refreshSession: jest.fn().mockResolvedValue({ session: 'newSession' }),
}));

describe('actions', () => {
  const workos = getWorkOS();
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
      expect(result).toEqual({ user: 'testUser' });
    });
  });

  describe('refreshAuthAction', () => {
    it('should refresh session', async () => {
      const params = { ensureSignedIn: true, organizationId: 'org_123' };
      const result = await refreshAuthAction(params);
      expect(refreshSession).toHaveBeenCalledWith(params);
      expect(result).toEqual({ session: 'newSession' });
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
});
