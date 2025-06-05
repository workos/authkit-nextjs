import { useContext, useEffect } from 'react';
import { AuthContext } from './AuthKitProvider.js';

export function useAuth({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) {
  const context = useContext(AuthContext);

  useEffect(() => {
    if (context && ensureSignedIn && !context.user && !context.loading) {
      context.getAuth({ ensureSignedIn });
    }
  }, [ensureSignedIn, context]);

  if (!context) {
    throw new Error('useAuth must be used within an AuthKitProvider');
  }

  return context;
}