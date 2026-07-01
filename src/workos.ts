import { WorkOS } from '@workos-inc/node';
import { config } from './config.js';
import { lazy } from './utils.js';

export const VERSION = '2.14.0';

const _workosClient = lazy(
  () =>
    new WorkOS(config.apiKey, {
      apiHostname: config.apiHostname,
      https: config.apiHttps,
      port: config.apiPort,
      appInfo: {
        name: 'authkit/nextjs',
        version: VERSION,
      },
    }),
);

export function getWorkOS(): WorkOS {
  return _workosClient();
}
