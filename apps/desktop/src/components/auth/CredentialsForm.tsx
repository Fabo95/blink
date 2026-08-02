import { Input } from '@/components/ui/input';
import type { LoginState } from '@/hooks/useLoginState';
import { useSession } from '@/hooks/useSession';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
import { Field } from './Field';

/** Step 1: email + password (+ name on sign-up), with the sign-in ↔ sign-up toggle. */
export function CredentialsForm({ state }: { state: LoginState }) {
  const { signIn, signUp } = useSession();
  const { mode, fields, error, busy, setField, setStep, toggleMode, forgotPassword, run } = state;
  const signup = mode === 'signup';

  const submit = () =>
    run(async () => {
      const email = fields.email.trim();
      const result = signup
        ? await signUp(email, fields.password, fields.name.trim())
        : await signIn(email, fields.password);
      // Authenticated results swap this screen out; otherwise a code was sent.
      if (result.status === 'verificationRequired') setStep('verify');
    });

  useShortcut('auth.toggleMode', { enabled: !busy, callback: toggleMode });
  useShortcut('auth.forgot', { enabled: !signup && !busy, callback: forgotPassword });

  return (
    <AuthCard description={signup ? 'Create your account' : 'Sign in to continue'}>
      <AuthForm busyLabel="Please wait…" busy={busy} onSubmit={() => void submit()}>
        {signup && (
          <Field label="Name" id="name">
            <Input
              id="name"
              value={fields.name}
              onChange={(e) => setField('name', e.target.value)}
              autoComplete="name"
              required
              disabled={busy}
            />
          </Field>
        )}
        <Field label="Email" id="email">
          <Input
            id="email"
            type="email"
            value={fields.email}
            onChange={(e) => setField('email', e.target.value)}
            autoComplete="email"
            required
            disabled={busy}
            // biome-ignore lint/a11y/noAutofocus: single entry point, keyboard-first.
            autoFocus
          />
        </Field>
        <Field label="Password" id="password">
          <Input
            id="password"
            type="password"
            value={fields.password}
            onChange={(e) => setField('password', e.target.value)}
            autoComplete={signup ? 'new-password' : 'current-password'}
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
