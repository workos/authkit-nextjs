import { checkSessionAction } from '../src/actions.js';

describe('actions', () => {
  describe('checkSessionAction', () => {
    it('should return true for authenticated users', async () => {
      const result = await checkSessionAction();
      expect(result).toBe(true);
    });
  });
});
