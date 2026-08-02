import { Input } from '@/components/ui/input';
import type { LoginState } from '@/hooks/useLoginState';
import { useSession } from '@/hooks/useSession';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
import { Field } from './Field';

/** Reset step 1: confirm the account email; a reset code is sent to it. */
export function ForgotPasswordForm({ state }: { state: LoginState }) {
  const { requestPasswordReset } = useSession();
  const { fields, error, busy, setField, setStep, back, run } = state;

  const submit = () =>
    run(async () => {
      await requestPasswordReset(fields.email.trim());
      setStep('resetPassword');
    });

  useShortcut('auth.back', { callback: back });

  return (
    <AuthCard description="Enter your account email and we'll send you a reset code">
      <AuthForm busyLabel="Sending…" busy={busy} onSubmit={() => void submit()}>
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
