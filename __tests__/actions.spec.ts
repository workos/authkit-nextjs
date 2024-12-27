import { checkSessionAction, handleSignOutAction } from '../src/actions.js';
import { signOut } from '../src/auth.js';

jest.mock('../src/auth.js', () => ({
  signOut: jest.fn().mockResolvedValue(true),
}));

describe('actions', () => {
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
});
