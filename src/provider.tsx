'use client';

import * as React from 'react';
import { checkSessionAction } from './actions.js';

interface AuthKitProviderProps {
  children: React.ReactNode;
  /**
   * Customize what happens when a session is expired. By default,the entire page will be reloaded.
   * You can also pass this as `false` to disable the expired session checks.
   */
  onSessionExpired?: false | (() => void);
}

export const AuthKitProvider = ({ children, onSessionExpired = false }: AuthKitProviderProps) => {
  React.useEffect(() => {
    // Return early if the session expired checks are disabled.
    if (onSessionExpired === false) {
      return;
    }

    let visibilityChangedCalled = false;

    const handleVisibilityChange = async () => {
      if (visibilityChangedCalled) {
        return;
      }

      // In the case where we're using middleware auth mode, a user that has signed out in a different tab
      // will run into an issue if they attempt to hit a server action in the original tab.
      // This will force a refresh of the page in that case, which will redirect them to the sign-in page.
      if (document.visibilityState === 'visible') {
        visibilityChangedCalled = true;

        try {
          const hasSession = await checkSessionAction();
          if (!hasSession) {
            throw new Error('Session expired');
          }
        } catch (error) {
          if (onSessionExpired) {
            onSessionExpired();
          } else {
            window.location.reload();
          }
        } finally {
          visibilityChangedCalled = false;
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onSessionExpired]);

  return <>{children}</>;
};
