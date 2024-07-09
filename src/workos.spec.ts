import { VERSION } from './workos';

describe('VERSION', () => {
  it('should match the version in package.json', () => {
    expect(VERSION).toEqual(process.env.npm_package_version);
  });
});
