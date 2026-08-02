import { Input } from '@/components/ui/input';
import type { LoginState } from '@/hooks/useLoginState';
import { useSession } from '@/hooks/useSession';
import { errorMessage } from '@/lib/errorMessage';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
import { Field } from './Field';

/** Step 2: enter the emailed OTP; then the flow signs in with the now-verified account. */
export function VerifyForm({ state }: { state: LoginState }) {
  const { verifyOtp, resendOtp, signIn } = useSession();
  const { fields, error, busy, setField, setError, back, run } = state;

  const submit = () =>
    run(async () => {
      const email = fields.email.trim();
      await verifyOtp(email, fields.otp.trim());
      const result = await signIn(email, fields.password); // now verified → session
      if (result.status !== 'authenticated') {
        throw new Error('Verified, but sign-in failed. Please try again.');
      }
    });

  const resend = async () => {
    setError(null);
    try {
      await resendOtp(fields.email.trim());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

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
        onSubmit={() => void submit()}
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
