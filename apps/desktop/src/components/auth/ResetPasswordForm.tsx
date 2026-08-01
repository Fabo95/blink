import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
import { Field } from './Field';

/** Reset step 2: the emailed code + a new password; then the flow signs back in. */
export function ResetPasswordForm({ flow }: { flow: LoginFlow }) {
  const { fields, error, busy, setField, submitReset, resend, back } = flow;

  useShortcut('auth.resend', { enabled: !busy, callback: () => void resend() });
  useShortcut('auth.back', { callback: back });

  return (
    <AuthCard
      description={
        <>
          Enter the 6-digit code we emailed to{' '}
          <span className="text-foreground">{fields.email}</span> and choose a new password
        </>
      }
    >
      <AuthForm
        busyLabel="Resetting…"
        busy={busy}
        disabled={busy || fields.otp.length < 6}
        onSubmit={() => void submitReset()}
      >
        <Field label="Reset code" id="otp">
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={fields.otp}
            onChange={(e) => setField('otp', e.target.value.replace(/\D/g, ''))}
            required
            disabled={busy}
            className="text-center text-lg tracking-[0.5em]"
            // biome-ignore lint/a11y/noAutofocus: first field on this step.
            autoFocus
          />
        </Field>
        <Field label="New password" id="password">
          <Input
            id="password"
            type="password"
            value={fields.password}
            onChange={(e) => setField('password', e.target.value)}
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
