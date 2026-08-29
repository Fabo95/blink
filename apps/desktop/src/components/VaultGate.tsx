import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { VaultError } from '@/components/vault/VaultError';
import { VaultScreen } from '@/components/vault/VaultScreen';
import type { VaultStatus } from '@/generated/VaultStatus';
import { api } from '@/lib/api';
import { errorText } from '@/lib/errorText';

type GateState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; status: VaultStatus };

/**
 * The vault gate — sits between the auth gate and the app. After sign-in it checks the
 * vault: an unlocked device drops straight through, otherwise it shows setup (fresh
 * account) or unlock (existing keyset). An unlocked vault resolves offline (the VMK is
 * cached); only a locked one hits the network, and a failure there surfaces an error +
 * retry rather than being mistaken for "unlock".
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'loading' });

  const check = useCallback(() => {
    setState({ kind: 'loading' });
    api
      .vaultStatus()
      .then((status) => setState({ kind: 'ready', status }))
      .catch((e) => setState({ kind: 'error', message: errorText(e) }));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state.kind === 'loading') return null;
  if (state.kind === 'error') return <VaultError message={state.message} onRetry={check} />;
  if (state.status === 'unlocked') return <>{children}</>;
  return (
    <VaultScreen
      status={state.status}
      onUnlocked={() => setState({ kind: 'ready', status: 'unlocked' })}
    />
  );
}
