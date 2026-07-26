import type { ReactNode } from 'react';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { useSession } from '@/hooks/useSession';

/**
 * The auth gate — this SPA's stand-in for route middleware. It sits between the
 * session provider and the app: renders the login screen until there's a session,
 * then the children. The session check is a fast local IPC call, so a blank frame
 * while it resolves is fine.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'loading') return null;
  if (status === 'unauthenticated') return <LoginScreen />;
  return <>{children}</>;
}
