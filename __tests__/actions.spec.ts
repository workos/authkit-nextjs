import {
  checkSessionAction,
  handleSignOutAction,
  getOrganizationAction,
  getAuthAction,
  refreshAuthAction,
} from '../src/actions.js';
import { signOut } from '../src/auth.js';
import { createWorkOSInstance } from '../src/workos.js';
import { withAuth, refreshSession } from '../src/session.js';

jest.mock('../src/auth.js', () => ({
  signOut: jest.fn().mockResolvedValue(true),
}));

const fakeWorkosInstance = {
  organizations: {
    getOrganization: jest.fn().mockResolvedValue({ id: 'org_123', name: 'Test Org' }),
  },
};
jest.mock('../src/workos.js', () => ({
  createWorkOSInstance: jest.fn(() => fakeWorkosInstance),
}));

jest.mock('../src/session.js', () => ({
  withAuth: jest.fn().mockResolvedValue({ user: 'testUser' }),
  refreshSession: jest.fn().mockResolvedValue({ session: 'newSession' }),
}));

describe('actions', () => {
  const workos = createWorkOSInstance();
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
});
