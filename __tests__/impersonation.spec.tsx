import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Impersonation } from '../src/impersonation.js';
import { withAuth } from '../src/session.js';
import { workos } from '../src/workos.js';

jest.mock('../src/session', () => ({
  withAuth: jest.fn(),
}));

jest.mock('../src/workos', () => ({
  workos: {
    organizations: {
      getOrganization: jest.fn(),
    },
  },
}));

describe('Impersonation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null if not impersonating', async () => {
    (withAuth as jest.Mock).mockResolvedValue({
      impersonator: null,
      user: { id: '123' },
      organizationId: null,
    });

    const { container } = await render(await Impersonation({}));
    expect(container).toBeEmptyDOMElement();
  });

  it('should render impersonation banner when impersonating', async () => {
    (withAuth as jest.Mock).mockResolvedValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123' },
      organizationId: null,
    });

    const { container } = await render(await Impersonation({}));
    expect(container.querySelector('[data-workos-impersonation-root]')).toBeInTheDocument();
  });

  it('should render with organization info when organizationId is provided', async () => {
    (withAuth as jest.Mock).mockResolvedValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123' },
      organizationId: 'org_123',
    });

    (workos.organizations.getOrganization as jest.Mock).mockResolvedValue({
      id: 'org_123',
      name: 'Test Org',
    });

    const { container } = await render(await Impersonation({}));
    expect(container.querySelector('[data-workos-impersonation-root]')).toBeInTheDocument();
  });

  it('should render at the bottom by default', async () => {
    (withAuth as jest.Mock).mockResolvedValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123' },
      organizationId: null,
    });

    const { container } = await render(await Impersonation({}));
    const banner = container.querySelector('[data-workos-impersonation-root] > div:nth-child(2)');
    expect(banner).toHaveStyle({ bottom: 'var(--wi-s)' });
  });

  it('should render at the top when side prop is "top"', async () => {
    (withAuth as jest.Mock).mockResolvedValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123' },
      organizationId: null,
    });

    const { container } = await render(await Impersonation({ side: 'top' }));
    const banner = container.querySelector('[data-workos-impersonation-root] > div:nth-child(2)');
    expect(banner).toHaveStyle({ top: 'var(--wi-s)' });
  });

  it('should merge custom styles with default styles', async () => {
    (withAuth as jest.Mock).mockResolvedValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123' },
      organizationId: null,
    });

    const customStyle = { backgroundColor: 'red' };
    const { container } = await render(await Impersonation({ style: customStyle }));
    const root = container.querySelector('[data-workos-impersonation-root]');
    expect(root).toHaveStyle({ backgroundColor: 'red' });
  });
});
