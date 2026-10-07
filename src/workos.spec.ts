import { WorkOS } from '@workos-inc/node';
import { getWorkOS, VERSION } from './workos.js';

describe('workos', () => {
  const workos = getWorkOS();
  beforeEach(() => {
    vi.clearAllMocks();
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
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('uses custom API hostname when provided', async () => {
      process.env.WORKOS_API_HOSTNAME = 'custom.workos.com';
      const { getWorkOS: customWorkos } = await import('./workos.js');

      expect(customWorkos().options.apiHostname).toEqual('custom.workos.com');
    });

    it('uses custom HTTPS setting when provided', async () => {
      process.env.WORKOS_API_HTTPS = 'false';
      const { getWorkOS: customWorkos } = await import('./workos.js');

      expect(customWorkos().options.https).toEqual(false);
    });

    describe('API key', () => {
      afterEach(() => {
        vi.doUnmock('@workos-inc/node');
      });

      async function constructorOptions() {
        const WorkOSMock = vi.fn();
        vi.doMock('@workos-inc/node', () => ({ WorkOS: WorkOSMock }));
        const { getWorkOS: customWorkos } = await import('./workos.js');
        customWorkos();
        expect(WorkOSMock).toHaveBeenCalledTimes(1);
        expect(WorkOSMock.mock.calls[0]).toHaveLength(1);
        return WorkOSMock.mock.calls[0][0];
      }

      it('passes the API key and client ID in confidential mode', async () => {
        process.env.WORKOS_API_KEY = 'sk_test_confidential';

        expect(await constructorOptions()).toMatchObject({
          apiKey: 'sk_test_confidential',
          clientId: process.env.WORKOS_CLIENT_ID,
        });
      });

      it.each([
        ['unset', undefined],
        ['empty', ''],
      ])('passes no API key when WORKOS_API_KEY is %s', async (_label, value) => {
        if (value === undefined) {
          delete process.env.WORKOS_API_KEY;
        } else {
          process.env.WORKOS_API_KEY = value;
        }

        const options = await constructorOptions();
        expect(options.apiKey).toBeUndefined();
        expect(options.clientId).toBe(process.env.WORKOS_CLIENT_ID);
      });

      it('builds a real keyless client', async () => {
        delete process.env.WORKOS_API_KEY;
        const { getWorkOS: customWorkos, getWorkOSWithApiKey } = await import('./workos.js');

        expect(customWorkos().key).toBeUndefined();
        expect(customWorkos().clientId).toBe(process.env.WORKOS_CLIENT_ID);
        expect(() => getWorkOSWithApiKey('someFeature')).toThrow(
          'someFeature requires a WorkOS API key; set WORKOS_API_KEY. Public-client (keyless) mode supports sign-in only.',
        );
      });

      it('returns the client for key-only features when a key is set', async () => {
        process.env.WORKOS_API_KEY = 'sk_test_confidential';
        const { getWorkOS: customWorkos, getWorkOSWithApiKey } = await import('./workos.js');

        expect(getWorkOSWithApiKey('someFeature')).toBe(customWorkos());
        expect(customWorkos().key).toBe('sk_test_confidential');
      });
    });

    it('uses custom port when provided', async () => {
      process.env.WORKOS_API_PORT = '8080';
      const { getWorkOS: customWorkos } = await import('./workos.js');

      expect(customWorkos().options.port).toEqual(8080);
    });
  });
});
