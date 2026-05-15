import { getWorkOS } from './workos.js';

describe('feature flags', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('memoizes the feature flags runtime client', async () => {
    const runtimeClient = {
      close: vi.fn(),
      getAllFlags: vi.fn(),
      getFlag: vi.fn(),
      getStats: vi.fn(),
      isEnabled: vi.fn(),
      waitUntilReady: vi.fn(),
    };
    const createRuntimeClient = vi
      .spyOn(getWorkOS().featureFlags, 'createRuntimeClient')
      .mockReturnValue(runtimeClient as never);
    const { getFeatureFlagsRuntimeClient } = await import('./feature-flags.js');

    expect(getFeatureFlagsRuntimeClient({ pollingIntervalMs: 5000 })).toBe(runtimeClient);
    expect(getFeatureFlagsRuntimeClient({ pollingIntervalMs: 30000 })).toBe(runtimeClient);
    expect(createRuntimeClient).toHaveBeenCalledTimes(1);
    expect(createRuntimeClient).toHaveBeenCalledWith({ pollingIntervalMs: 5000 });
  });
});
