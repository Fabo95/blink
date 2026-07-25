import { brand } from '@blink/core/theme';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/useSession';

type Mode = 'signin' | 'signup';

/** Pull the human message out of a rejected Tauri command (`AppError { kind, message }`). */
function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function LoginScreen() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password, name.trim());
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            {brand.name}
          </CardTitle>
          <CardDescription>
            {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  disabled={busy}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={busy}
                // biome-ignore lint/a11y/noAutofocus: single entry point, keyboard-first.
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                disabled={busy}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <button
        type="button"
        className="fixed bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setError(null);
        }}
      >
        {mode === 'signin' ? 'No account? Create one' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
