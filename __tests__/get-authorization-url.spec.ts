import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getAuthorizationUrl } from '../src/get-authorization-url.js';
import { headers } from 'next/headers';
import { getWorkOS } from '../src/workos.js';

jest.mock('next/headers');

// Mock dependencies
const fakeWorkosInstance = {
  userManagement: {
    getAuthorizationUrl: jest.fn(),
  },
};

jest.mock('../src/workos', () => ({
  getWorkOS: jest.fn(() => fakeWorkosInstance),
}));

describe('getAuthorizationUrl', () => {
  const workos = getWorkOS();
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses x-redirect-uri header when redirectUri option is not provided', async () => {
    const nextHeaders = await headers();
    nextHeaders.set('x-redirect-uri', 'http://test-redirect.com');

    // Mock workos.userManagement.getAuthorizationUrl
    jest.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

    await getAuthorizationUrl({});

    expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'http://test-redirect.com',
      }),
    );
  });

  it('works when called with no arguments', async () => {
    jest.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

    await getAuthorizationUrl(); // Call with no arguments

    expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalled();
  });
});
