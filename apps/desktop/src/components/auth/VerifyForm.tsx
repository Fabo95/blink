import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

/** Step 2: enter the emailed OTP; then the flow signs in with the now-verified account. */
export function VerifyForm({ flow }: { flow: LoginFlow }) {
  const { fields, error, busy, setField, submitOtp, resend, back } = flow;

  return (
    <AuthCard
      description={
        <>
          Enter the 6-digit code we emailed to{' '}
          <span className="text-foreground">{fields.email}</span>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitOtp();
        }}
        className="space-y-4"
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

        <Button type="submit" className="w-full" disabled={busy || fields.otp.length < 6}>
          {busy ? 'Verifying…' : 'Verify'}
        </Button>
      </form>

      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <button type="button" className="hover:text-foreground" onClick={back}>
          Back
        </button>
        <button
          type="button"
          className="hover:text-foreground disabled:opacity-50"
          onClick={() => void resend()}
          disabled={busy}
        >
          Resend code
        </button>
      </div>
    </AuthCard>
  );
}
