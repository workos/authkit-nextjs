import { authkitMiddleware, authkitProxy } from './middleware.js';

describe('middleware', () => {
  describe('authkitProxy', () => {
    it('should return a middleware function when called with no options', () => {
      const middleware = authkitProxy();
      expect(typeof middleware).toBe('function');
    });

    it('should accept the same options as authkitMiddleware', () => {
      const middleware = authkitProxy({
        debug: true,
        middlewareAuth: { enabled: true, unauthenticatedPaths: ['/public'] },
        signUpPaths: ['/sign-up'],
      });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('authkitMiddleware (deprecated alias)', () => {
    it('should be the same function reference as authkitProxy', () => {
      expect(authkitMiddleware).toBe(authkitProxy);
    });
  });
});
