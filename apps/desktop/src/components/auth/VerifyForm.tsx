import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
import { Field } from './Field';

/** Step 2: enter the emailed OTP; then the flow signs in with the now-verified account. */
export function VerifyForm({ flow }: { flow: LoginFlow }) {
  const { fields, error, busy, setField, submitOtp, resend, back } = flow;

  useShortcut('auth.resend', { enabled: !busy, callback: () => void resend() });
  useShortcut('auth.back', { callback: back });

  return (
    <AuthCard
      description={
        <>
          Enter the 6-digit code we emailed to{' '}
          <span className="text-foreground">{fields.email}</span>
        </>
      }
    >
      <AuthForm
        busyLabel="Verifying…"
        busy={busy}
        disabled={busy || fields.otp.length < 6}
        onSubmit={() => void submitOtp()}
      >
        <Field label="Verification code" id="otp">
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
            // biome-ignore lint/a11y/noAutofocus: single field on this step.
            autoFocus
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </AuthForm>
    </AuthCard>
  );
}
