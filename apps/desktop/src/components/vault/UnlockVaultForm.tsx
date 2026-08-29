import { useState } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthForm } from '@/components/auth/AuthForm';
import { Field } from '@/components/auth/Field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/**
 * New-device unlock: master password + the saved Secret Key (⌘↵ to unlock). On success
 * the VMK is cached and `onUnlocked` drops through to the app. A wrong password or
 * Secret Key fails loudly (the wrapped VMK's tag won't verify).
 */
export function UnlockVaultForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = () => {
    setError(null);
    setBusy(true);
    api
      .unlockVault(password, secretKey.trim())
      .then(onUnlocked)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(false));
  };

  return (
    <AuthCard description="Unlock sync on this device">
      <AuthForm busyLabel="Unlocking…" busy={busy} onSubmit={unlock}>
        <p className="text-sm text-muted-foreground">
          Enter your master password and the Secret Key you saved when you set up sync.
        </p>
        <Field label="Master password" id="unlock-password">
          <Input
            id="unlock-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy}
            // biome-ignore lint/a11y/noAutofocus: keyboard-first single entry point.
            autoFocus
          />
        </Field>
        <Field label="Secret Key" id="unlock-secret-key">
          <Input
            id="unlock-secret-key"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={busy}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </AuthForm>
    </AuthCard>
  );
}

function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
