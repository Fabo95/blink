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
type Step = 'credentials' | 'verify';

/** Pull the human message out of a rejected Tauri command (`AppError { kind, message }`). */
function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

const Brand = () => (
  <CardTitle className="bg-gradient-to-br from-blink-soft to-blink-bright bg-clip-text text-lg font-semibold tracking-tight text-transparent">
    {brand.name}
  </CardTitle>
);

export function LoginScreen() {
  const { signIn, signUp, verifyOtp, resendOtp } = useSession();
  const [step, setStep] = useState<Step>('credentials');
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === 'signup'
          ? await signUp(email.trim(), password, name.trim())
          : await signIn(email.trim(), password);
      // The server sent a code (on sign-up, or on an unverified sign-in). Authenticated
      // results swap this screen out via AuthGate, so there's nothing else to do.
      if (result.status === 'verificationRequired') setStep('verify');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(email.trim(), otp.trim());
      const result = await signIn(email.trim(), password); // now verified → session
      if (result.status !== 'authenticated') {
        setError('Verified, but sign-in failed. Please try again.');
        setBusy(false);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await resendOtp(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (step === 'verify') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Brand />
            <CardDescription>
              Enter the 6-digit code we emailed to <span className="text-foreground">{email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  disabled={busy}
                  className="text-center text-lg tracking-[0.5em]"
                  // biome-ignore lint/a11y/noAutofocus: single field on this step.
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={busy || otp.length < 6}>
                {busy ? 'Verifying…' : 'Verify'}
              </Button>
            </form>

            <div className="mt-4 flex justify-between text-xs text-muted-foreground">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => {
                  setStep('credentials');
                  setOtp('');
                  setError(null);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="hover:text-foreground disabled:opacity-50"
                onClick={resend}
                disabled={busy}
              >
                Resend code
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Brand />
          <CardDescription>
            {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCredentials} className="space-y-4">
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
