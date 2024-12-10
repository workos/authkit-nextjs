import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthKitProvider } from '../src/components/authkit-provider.js';
import { checkSessionAction } from '../src/actions.js';

jest.mock('../src/actions', () => ({
  checkSessionAction: jest.fn(),
}));

describe('AuthKitProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children', () => {
    const { getByText } = render(
      <AuthKitProvider>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('should do nothing if onSessionExpired is false', async () => {
    jest.spyOn(window, 'addEventListener');

    render(
      <AuthKitProvider onSessionExpired={false}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // expect window to not have an event listener
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it('should call onSessionExpired when session is expired', async () => {
    (checkSessionAction as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    const onSessionExpired = jest.fn();

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // Simulate visibility change
    window.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalled();
    });
  });

  it('should only call onSessionExpired once if multiple visibility changes occur', async () => {
    (checkSessionAction as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    const onSessionExpired = jest.fn();

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // Simulate visibility change twice
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
  });

  it('should pass through if checkSessionAction does not throw "Failed to fetch"', async () => {
    (checkSessionAction as jest.Mock).mockResolvedValueOnce(false);

    const onSessionExpired = jest.fn();

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // Simulate visibility change
    window.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });

  it('should reload the page when session is expired and no onSessionExpired handler is provided', async () => {
    (checkSessionAction as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));

    const originalLocation = window.location;

    // @ts-expect-error - we're deleting the property to test the mock
    delete window.location;

    window.location = { ...window.location, reload: jest.fn() };

    render(
      <AuthKitProvider>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // Simulate visibility change
    window.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(window.location.reload).toHaveBeenCalled();
    });

    // Restore original reload function
    window.location = originalLocation;
  });

  it('should not call onSessionExpired or reload the page if session is valid', async () => {
    (checkSessionAction as jest.Mock).mockResolvedValueOnce(true);
    const onSessionExpired = jest.fn();

    const originalLocation = window.location;

    // @ts-expect-error - we're deleting the property to test the mock
    delete window.location;

    window.location = { ...window.location, reload: jest.fn() };

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // Simulate visibility change
    window.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(onSessionExpired).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    });

    window.location = originalLocation;
  });
});
