'use client';

import * as React from 'react';
import { checkSessionAction } from './actions.js';

export const AuthKitProvider = ({ children }: React.PropsWithChildren) => {
  React.useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const hasSession = await checkSessionAction();
          if (!hasSession) {
            throw new Error('Session expired');
          }
        } catch (error) {
          window.location.reload();
        }
      }
    };

    // In the case where we're using middleware auth mode, a user that has signed out in a different tab
    // will run into an issue if they attempt to hit a server action in the original tab.
    // This will force a refresh of the page in that case, which will redirect them to the sign-in page.
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return <>{children}</>;
};
