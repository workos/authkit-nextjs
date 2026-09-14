import { renderHook } from '@testing-library/react';
import { useRecentAuth } from './useRecentAuth.js';
import { useAccessToken } from './useAccessToken.js';
import { useTokenClaims } from './useTokenClaims.js';

vi.mock('./useAccessToken.js');
vi.mock('./useTokenClaims.js');

const NOW_MS = 1_700_000_000_000;
const NOW_S = NOW_MS / 1000;

function mockAccessToken(loading: boolean) {
  vi.mocked(useAccessToken).mockReturnValue({
    accessToken: undefined,
    loading,
    error: null,
    refresh: vi.fn(),
    getAccessToken: vi.fn(),
  });
}

describe('useRecentAuth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    mockAccessToken(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reports recent auth as not stale', () => {
    vi.mocked(useTokenClaims).mockReturnValue({ auth_time: NOW_S - 60 });

    const { result } = renderHook(() => useRecentAuth({ maxAge: 300 }));

    expect(result.current.isStale).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.authenticatedAt).toEqual(new Date((NOW_S - 60) * 1000));
  });

  it('reports stale auth past maxAge', () => {
    vi.mocked(useTokenClaims).mockReturnValue({ auth_time: NOW_S - 600 });

    const { result } = renderHook(() => useRecentAuth({ maxAge: 300 }));

    expect(result.current.isStale).toBe(true);
  });

  it('fails closed when auth_time is absent', () => {
    vi.mocked(useTokenClaims).mockReturnValue({});

    const { result } = renderHook(() => useRecentAuth({ maxAge: 300 }));

    expect(result.current.isStale).toBe(true);
    expect(result.current.authenticatedAt).toBeNull();
  });

  it('surfaces the token loading state', () => {
    mockAccessToken(true);
    vi.mocked(useTokenClaims).mockReturnValue({});

    const { result } = renderHook(() => useRecentAuth({ maxAge: 300 }));

    expect(result.current.loading).toBe(true);
  });
});
