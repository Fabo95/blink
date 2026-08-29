import type { VaultStatus } from '@/generated/VaultStatus';
import { Hints } from '@/lib/shortcuts/Hints';
import { SetupVaultForm } from './SetupVaultForm';
import { UnlockVaultForm } from './UnlockVaultForm';

/** The vault gate's UI — setup (first time) or unlock (new device), with the shortcut
 *  statusline pinned to the bottom, mirroring the login screen. */
export function VaultScreen({
  status,
  onUnlocked,
}: {
  status: Exclude<VaultStatus, 'unlocked'>;
  onUnlocked: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {status === 'needsSetup' ? (
          <SetupVaultForm onUnlocked={onUnlocked} />
        ) : (
          <UnlockVaultForm onUnlocked={onUnlocked} />
        )}
      </div>
      <footer className="flex justify-center border-t border-border/50 px-6 py-3">
        <Hints />
      </footer>
    </div>
  );
}
