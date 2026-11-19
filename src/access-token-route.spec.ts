import { handleAccessToken } from './access-token-route.js';
import { refreshSession, withAuth } from './session.js';

vi.mock('./session.js', () => ({
  withAuth: vi.fn(),
  refreshSession: vi.fn(),
}));

describe('handleAccessToken', () => {
  const { GET, POST } = handleAccessToken();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET returns the current access token without refreshing', async () => {
    vi.mocked(withAuth).mockResolvedValue({ user: null, accessToken: 'current' } as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ accessToken: 'current' });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('POST refreshes the session and returns the new access token', async () => {
    vi.mocked(refreshSession).mockResolvedValue({ user: null, accessToken: 'refreshed' } as never);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accessToken: 'refreshed' });
  });

  it('POST returns a generic error when the refresh fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(refreshSession).mockRejectedValue(new Error('invalid_grant: secret detail'));

    const response = await POST();

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'Failed to refresh access token' });
  });
});
