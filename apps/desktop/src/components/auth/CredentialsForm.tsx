import { Input } from '@/components/ui/input';
import type { LoginFlow } from '@/hooks/useLoginFlow';
import { AuthAction } from './AuthAction';
import { AuthCard } from './AuthCard';
import { AuthForm } from './AuthForm';
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
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
          <AuthAction
            display="⌘n"
            command="auth.toggleMode"
            label={signup ? 'sign in instead' : 'create account'}
            onAction={toggleMode}
          />
        </div>
      }
    >
      <AuthForm
        label={signup ? 'Create account' : 'Sign in'}
        busyLabel="Please wait…"
        busy={busy}
        onSubmit={() => void submitCredentials()}
        actions={
          !signup && (
            <AuthAction
              display="⌘f"
              command="auth.forgot"
              label="forgot password"
              onAction={forgotPassword}
              disabled={busy}
            />
          )
        }
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

        {error && <p className="text-sm text-destructive">{error}</p>}
      </AuthForm>
    </AuthCard>
  );
}
