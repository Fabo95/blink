import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { AuthCard } from './AuthCard';
import { Field } from './Field';

/** Step 1: email + password (+ name on sign-up), with the sign-in ↔ sign-up toggle. */
export function CredentialsForm({ flow }: { flow: LoginFlow }) {
  const { mode, fields, error, busy, setField, submitCredentials, toggleMode, forgotPassword } =
    flow;
  const signup = mode === 'signup';

  return (
    <AuthCard
      description={signup ? 'Create your account' : 'Sign in to continue'}
      footer={
        <button
          type="button"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground hover:text-foreground"
          onClick={toggleMode}
        >
          {signup ? 'Have an account? Sign in' : 'No account? Create one'}
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitCredentials();
        }}
        className="space-y-4"
      >
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

        {!signup && (
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={forgotPassword}
              disabled={busy}
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
