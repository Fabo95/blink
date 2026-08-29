import { useState } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthForm } from '@/components/auth/AuthForm';
import { Field } from '@/components/auth/Field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { errorText } from '@/lib/errorText';

/**
 * First-time sync setup, two keyboard-only steps (⌘↵ advances each):
 * 1. choose a master password (+ confirm) → creates the vault + uploads the keyset;
 * 2. reveal the Secret Key once, gated behind an "I've saved it" acknowledgement.
 * On confirm the vault is already unlocked, so `onUnlocked` drops through to the app.
 */
export function SetupVaultForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createVault = () => {
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    api
      .setupVault(password)
      .then(setSecretKey)
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  if (secretKey) {
    return (
      <AuthCard description="Save your Secret Key">
        <AuthForm busyLabel="" busy={false} disabled={!saved} onSubmit={onUnlocked}>
          <p className="text-sm text-muted-foreground">
            This is shown once and never sent to the server. You'll need it — with your
            master password — to unlock sync on another device. Store it somewhere safe;
            it can't be recovered.
          </p>
          <div className="select-text rounded-md border border-border bg-muted/40 px-3 py-2 text-center font-mono text-sm tracking-wide">
            {secretKey}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="size-4 accent-blink-bright"
              // biome-ignore lint/a11y/noAutofocus: keyboard-first, single control on the step.
              autoFocus
            />
            I've saved my Secret Key
          </label>
        </AuthForm>
      </AuthCard>
    );
  }

  return (
    <AuthCard description="Set up sync — choose a master password">
      <AuthForm busyLabel="Setting up…" busy={busy} onSubmit={createVault}>
        <p className="text-sm text-muted-foreground">
          Your tasks are end-to-end encrypted with a master password. It never leaves this
          device, so it can't be reset — only you can unlock your data.
        </p>
        <Field label="Master password" id="master-password">
          <Input
            id="master-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={busy}
            // biome-ignore lint/a11y/noAutofocus: keyboard-first single entry point.
            autoFocus
          />
        </Field>
        <Field label="Confirm password" id="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={busy}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </AuthForm>
    </AuthCard>
  );
}
