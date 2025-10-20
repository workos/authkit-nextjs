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
    });

    const { container } = render(<Impersonation />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render impersonation banner when impersonating', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
    });

    const { container } = render(<Impersonation />);
    expect(container.querySelector('[data-workos-impersonation-root]')).toBeInTheDocument();
  });

  it('should render with organization info when organizationId is provided', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: 'org_123',
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

  it('should not call getOrganizationAction when organizationId is not provided', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: { id: '123', email: 'user@example.com' },
      organizationId: null,
    });

    render(<Impersonation />);
    expect(getOrganizationAction).not.toHaveBeenCalled();
  });

  it('should not call getOrganizationAction when impersonator is not present', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: null,
      user: { id: '123', email: 'user@example.com' },
      organizationId: 'org_123',
    });

    render(<Impersonation />);
    expect(getOrganizationAction).not.toHaveBeenCalled();
  });

  it('should not call getOrganizationAction when user is not present', () => {
    (useAuth as jest.Mock).mockReturnValue({
      impersonator: { email: 'admin@example.com' },
      user: null,
      organizationId: 'org_123',
    });

    render(<Impersonation />);
    expect(getOrganizationAction).not.toHaveBeenCalled();
  });

  it('should not call getOrganizationAction again when organization is already loaded with same ID', async () => {
    const mockOrg = {
      id: 'org_123',
      name: 'Test Org',
    };

    (getOrganizationAction as jest.Mock).mockResolvedValue(mockOrg);

    const { rerender } = await act(async () => {
      (useAuth as jest.Mock).mockReturnValue({
        impersonator: { email: 'admin@example.com' },
        user: { id: '123', email: 'user@example.com' },
        organizationId: 'org_123',
      });

      return render(<Impersonation />);
    });

    // Wait for the initial call to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getOrganizationAction).toHaveBeenCalledTimes(1);

    // Rerender with the same organizationId
    await act(async () => {
      (useAuth as jest.Mock).mockReturnValue({
        impersonator: { email: 'admin@example.com' },
        user: { id: '123', email: 'user@example.com' },
        organizationId: 'org_123',
      });

      rerender(<Impersonation />);
    });

    // Should still be called only once
    expect(getOrganizationAction).toHaveBeenCalledTimes(1);
  });

  it('should call getOrganizationAction again when organizationId changes', async () => {
    const mockOrg1 = {
      id: 'org_123',
      name: 'Test Org 1',
    };

    const mockOrg2 = {
      id: 'org_456',
      name: 'Test Org 2',
    };

    (getOrganizationAction as jest.Mock).mockResolvedValueOnce(mockOrg1).mockResolvedValueOnce(mockOrg2);

    const { rerender } = await act(async () => {
      (useAuth as jest.Mock).mockReturnValue({
        impersonator: { email: 'admin@example.com' },
        user: { id: '123', email: 'user@example.com' },
        organizationId: 'org_123',
      });

      return render(<Impersonation />);
    });

    // Wait for the initial call to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getOrganizationAction).toHaveBeenCalledTimes(1);
    expect(getOrganizationAction).toHaveBeenCalledWith('org_123');

    // Rerender with a different organizationId
    await act(async () => {
      (useAuth as jest.Mock).mockReturnValue({
        impersonator: { email: 'admin@example.com' },
        user: { id: '123', email: 'user@example.com' },
        organizationId: 'org_456',
      });

      rerender(<Impersonation />);
    });

    // Should be called again with the new ID
    expect(getOrganizationAction).toHaveBeenCalledTimes(2);
    expect(getOrganizationAction).toHaveBeenCalledWith('org_456');
  });
});
