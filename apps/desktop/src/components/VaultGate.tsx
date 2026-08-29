import { type ReactNode, useEffect, useState } from 'react';
import { VaultScreen } from '@/components/vault/VaultScreen';
import type { VaultStatus } from '@/generated/VaultStatus';
import { api } from '@/lib/api';

/**
 * The vault gate — sits between the auth gate and the app. After sign-in it checks the
 * vault: an unlocked device drops straight through, otherwise it shows setup (fresh
 * account) or unlock (existing keyset). An unlocked vault resolves offline (the VMK is
 * cached), so only a locked one hits the network — where a failure means "unlock".
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus | 'loading'>('loading');

  useEffect(() => {
    let active = true;
    api
      .vaultStatus()
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatus('needsUnlock'));
    return () => {
      active = false;
    };
  }, []);

  if (status === 'loading') return null;
  if (status === 'unlocked') return <>{children}</>;
  return <VaultScreen status={status} onUnlocked={() => setStatus('unlocked')} />;
}
