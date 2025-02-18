import { WorkOS } from '@workos-inc/node';
import { createWorkOSInstance, VERSION } from '../src/workos.js';

describe('workos', () => {
  const workos = createWorkOSInstance();
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes WorkOS with the correct configuration', () => {
    // Extracting the config to avoid a circular dependency error
    const workosConfig = {
      apiHostname: workos.options.apiHostname,
      https: workos.options.https,
      port: workos.options.port,
      appInfo: workos.options.appInfo,
    };

    expect(workosConfig).toEqual({
      apiHostname: undefined,
      https: true,
      port: undefined,
      appInfo: {
        name: 'authkit/nextjs',
        version: VERSION,
      },
    });
  });

  it('exports a WorkOS instance', () => {
    expect(workos).toBeInstanceOf(WorkOS);
  });

  describe('with custom environment variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('uses custom API hostname when provided', async () => {
      process.env.WORKOS_API_HOSTNAME = 'custom.workos.com';
      const { createWorkOSInstance: customWorkos } = await import('../src/workos.js');

      expect(customWorkos().options.apiHostname).toEqual('custom.workos.com');
    });

    it('uses custom HTTPS setting when provided', async () => {
      process.env.WORKOS_API_HTTPS = 'false';
      const { createWorkOSInstance: customWorkos } = await import('../src/workos.js');

      expect(customWorkos().options.https).toEqual(false);
    });

    it('uses custom port when provided', async () => {
      process.env.WORKOS_API_PORT = '8080';
      const { createWorkOSInstance: customWorkos } = await import('../src/workos.js');

      expect(customWorkos().options.port).toEqual(8080);
    });
  });
});
