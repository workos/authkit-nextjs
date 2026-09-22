import { TokenStore } from './tokenStore.js';
import { getAccessTokenAction, refreshAccessTokenAction } from '../actions.js';

vi.mock('../actions.js', () => ({
  getAccessTokenAction: vi.fn(),
  refreshAccessTokenAction: vi.fn(),
}));

const refresh = vi.mocked(refreshAccessTokenAction);
let store: TokenStore;

function makeToken(lifetime: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user_123', sid: 'session_123', iat: now, exp: now + lifetime };
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;
}

function setup(lifetime: number, initialCookie = true) {
  const initial = makeToken(lifetime);
  document.cookie = initialCookie ? `workos-access-token=${initial}` : '';
  refresh.mockImplementation(async () => ({ accessToken: makeToken(lifetime) }));
  vi.mocked(getAccessTokenAction).mockResolvedValue(initial);
  store = new TokenStore();
  const unsubscribe = store.subscribe(() => {});
  return { initial, unsubscribe };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.resetAllMocks();
  vi.stubGlobal('window', { location: { protocol: 'https:' } });
  vi.stubGlobal('document', { cookie: '' });
});

afterEach(() => {
  store?.reset();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('continuous token refresh scheduling', () => {
  it.each([60, 300, 3600])('refreshes %s-second tokens for multiple cycles without activity', async (lifetime) => {
    setup(lifetime);
    const cycle = (lifetime - (lifetime <= 300 ? 30 : 60)) * 1000;

    for (let count = 1; count <= 3; count++) {
      await vi.advanceTimersByTimeAsync(cycle - 1);
      expect(refresh).toHaveBeenCalledTimes(count - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(refresh).toHaveBeenCalledTimes(count);
      expect(vi.getTimerCount()).toBe(1);
    }
  });

  it('re-arms an early timer clamped to the maximum delay', async () => {
    setup(172_800);
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(86_340_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('waits before retrying an unchanged near-expiry token', async () => {
    const { initial } = setup(60);
    refresh.mockResolvedValue({ accessToken: initial });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('schedules a fast cookie consumed through the explicit getter after construction', async () => {
    const { initial } = setup(300, false);
    expect(vi.getTimerCount()).toBe(0);
    document.cookie = `workos-access-token=${initial}`;

    expect(await store.getAccessToken()).toBe(initial);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(270_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  describe.each(['getAccessToken', 'getAccessTokenSilently'] as const)('%s', (getter) => {
    it.each([10, 0, -10])(
      'refreshes a fast cookie with %s seconds remaining before returning it',
      async (remaining) => {
        setup(300, false);
        document.cookie = `workos-access-token=${makeToken(remaining)}`;
        const freshToken = makeToken(300);
        let complete!: (result: { accessToken: string }) => void;
        refresh.mockReturnValue(
          new Promise((resolve) => {
            complete = resolve;
          }),
        );

        const request = store[getter]();
        expect(refresh).toHaveBeenCalledTimes(1);
        const resolved = vi.fn();
        void request.then(resolved);
        await Promise.resolve();
        expect(resolved).not.toHaveBeenCalled();

        complete({ accessToken: freshToken });
        expect(await request).toBe(freshToken);
        expect(store.getSnapshot().token).toBe(freshToken);
        expect(vi.getTimerCount()).toBe(1);
      },
    );
  });

  it('refreshes an expiring constructor cookie as soon as a subscriber attaches', async () => {
    document.cookie = `workos-access-token=${makeToken(10)}`;
    const freshToken = makeToken(300);
    refresh.mockResolvedValue({ accessToken: freshToken });
    store = new TokenStore();

    expect(vi.getTimerCount()).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
    store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().token).toBe(freshToken);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps the retry floor when the immediate cookie refresh returns the same token', async () => {
    const { initial } = setup(10);
    refresh.mockResolvedValue({ accessToken: initial });

    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('resumes continuous scheduling after a failed refresh', async () => {
    setup(60);
    refresh.mockRejectedValueOnce(new Error('Offline'));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('coalesces concurrent checks with an in-flight scheduled refresh', async () => {
    setup(60);
    let complete!: (result: { accessToken: string }) => void;
    refresh.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );

    await vi.advanceTimersByTimeAsync(30_000);
    const requests = Array.from({ length: 5 }, () => store.getAccessTokenSilently());
    expect(refresh).toHaveBeenCalledTimes(1);
    complete({ accessToken: makeToken(60) });
    await Promise.all(requests);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps one schedule after checking an expired token on wake', async () => {
    setup(300);
    vi.setSystemTime(Date.now() + 600_000);

    await store.getAccessTokenSilently();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(270_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });
});
