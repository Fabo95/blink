import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

/** Reset step 1: confirm the account email; a reset code is sent to it. */
export function ForgotPasswordForm({ flow }: { flow: LoginFlow }) {
  const { fields, error, busy, setField, submitResetRequest, back } = flow;

  return (
    <AuthCard description="Enter your account email and we'll send you a reset code">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitResetRequest();
        }}
        className="space-y-4"
      >
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

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset code'}
        </Button>
      </form>

      <div className="mt-4 flex justify-start text-xs text-muted-foreground">
        <button type="button" className="hover:text-foreground" onClick={back}>
          Back to sign in
        </button>
      </div>
    </AuthCard>
  );
}
