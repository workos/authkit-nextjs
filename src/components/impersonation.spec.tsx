import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Impersonation } from './impersonation.js';
import { useAuth } from './authkit-provider.js';
import { getOrganizationAction } from '../actions.js';
import * as React from 'react';
import { handleSignOutAction } from '../actions.js';

// Mock the useAuth hook
jest.mock('./authkit-provider', () => ({
  useAuth: jest.fn(),
}));

// Mock the getOrganizationAction
jest.mock('../actions', () => ({
  getOrganizationAction: jest.fn(),
  handleSignOutAction: jest.fn(),
}));

describe('Impersonation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null if not impersonating', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: null,
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    const { container } = render(<Impersonation />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should return null if loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: true,
    });

    const { container } = render(<Impersonation />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render impersonation banner when impersonating', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    const { container } = render(<Impersonation />);
    expect(container.querySelector('[data-workos-impersonation-root]')).toBeInTheDocument();
  });

  it('should render with organization info when organizationId is provided', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: 'org_123',
      loading: false,
    });

    (getOrganizationAction as jest.Mock).mockResolvedValue({
      id: 'org_123',
      name: 'Test Org',
    });

    const { container } = await act(async () => {
      return render(<Impersonation />);
    });

    expect(container.querySelector('[data-workos-impersonation-root]')).toBeInTheDocument();
  });

  it('should render at the bottom by default', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    const { container } = render(<Impersonation />);
    const banner = container.querySelector('[data-workos-impersonation-root] > div:nth-child(2)');
    expect(banner).toHaveStyle({ bottom: 'var(--wi-s)' });
  });

  it('should render at the top when side prop is "top"', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    const { container } = render(<Impersonation side="top" />);
    const banner = container.querySelector('[data-workos-impersonation-root] > div:nth-child(2)');
    expect(banner).toHaveStyle({ top: 'var(--wi-s)' });
  });

  it('should merge custom styles with default styles', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    const customStyle = { backgroundColor: 'red' };
    const { container } = render(<Impersonation style={customStyle} />);
    const root = container.querySelector('[data-workos-impersonation-root]');
    expect(root).toHaveStyle({ backgroundColor: 'red' });
  });

  it('should should sign out when the Stop button is called', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    render(<Impersonation />);
    const stopButton = await screen.findByText('Stop');
    stopButton.click();
    expect(handleSignOutAction).toHaveBeenCalledWith({});
  });

  it('should pass returnTo prop to handleSignOutAction when provided', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
      loading: false,
    });

    const returnTo = '/dashboard';
    render(<Impersonation returnTo={returnTo} />);
    const stopButton = await screen.findByText('Stop');
    stopButton.click();
    expect(handleSignOutAction).toHaveBeenCalledWith({ returnTo });
  });
});
