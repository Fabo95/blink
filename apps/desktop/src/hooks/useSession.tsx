import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { AuthResult } from '@/generated/AuthResult';
import type { AuthUser } from '@/generated/AuthUser';
import { api } from '@/lib/api';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface Session {
  status: SessionStatus;
  user: AuthUser | null;
  // Return the outcome so the login screen can branch to the verify step when the
  // account still needs its email confirmed.
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, name: string) => Promise<AuthResult>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Owns the app-launch auth state and actions, provided once at the top of the main
 * window. On mount it asks the Rust core for the cached session (offline-friendly —
 * no network); the bearer token never enters the webview, only the account profile.
 * Consumed by {@link useSession} — the `AuthGate`, `LoginScreen`, and `Header`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    let active = true;
    api
      .currentSession()
      .then((current) => {
        if (!active) return;
        setUser(current);
        setStatus(current ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (active) setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, []);

  const enter = useCallback((result: AuthResult) => {
    if (result.status === 'authenticated' && result.user) {
      setUser(result.user);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => enter(await api.signIn(email, password)),
    [enter],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) =>
      enter(await api.signUp(email, password, name)),
    [enter],
  );

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    await api.verifyEmail(email, otp);
  }, []);

  const resendOtp = useCallback(async (email: string) => {
    await api.resendVerification(email);
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<Session>(
    () => ({ status, user, signIn, signUp, verifyOtp, resendOtp, signOut }),
    [status, user, signIn, signUp, verifyOtp, resendOtp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within <SessionProvider>');
  return session;
}
