import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
import { Field } from './Field';

/** Reset step 1: confirm the account email; a reset code is sent to it. */
export function ForgotPasswordForm({ flow }: { flow: LoginFlow }) {
  const { fields, error, busy, setField, submitResetRequest, back } = flow;

  useShortcut('auth.back', { callback: back });

  return (
    <AuthCard description="Enter your account email and we'll send you a reset code">
      <AuthForm busyLabel="Sending…" busy={busy} onSubmit={() => void submitResetRequest()}>
        <Field label="Email" id="email">
          <Input
            id="email"
            type="email"
            value={fields.email}
            onChange={(e) => setField('email', e.target.value)}
            autoComplete="email"
            required
            disabled={busy}
            // biome-ignore lint/a11y/noAutofocus: single field on this step.
            autoFocus
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </AuthForm>
    </AuthCard>
  );
}
