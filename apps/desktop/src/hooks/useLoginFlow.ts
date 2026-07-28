import { useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { errorMessage } from '@/lib/errorMessage';

export type LoginStep = 'credentials' | 'verify' | 'forgotPassword' | 'resetPassword';
export type LoginMode = 'signin' | 'signup';

interface Fields {
  name: string;
  email: string;
  password: string;
  otp: string;
}

/** Everything the login forms need — the state machine lives here, the UI is dumb. */
export interface LoginFlow {
  step: LoginStep;
  mode: LoginMode;
  fields: Fields;
  error: string | null;
  busy: boolean;
  setField: (key: keyof Fields, value: string) => void;
  toggleMode: () => void;
  submitCredentials: () => Promise<void>;
  submitOtp: () => Promise<void>;
  forgotPassword: () => void;
  submitResetRequest: () => Promise<void>;
  submitReset: () => Promise<void>;
  resend: () => Promise<void>;
  back: () => void;
}

const EMPTY_FIELDS: Fields = { name: '', email: '', password: '', otp: '' };

/**
 * The sign-in/up + email-verification + password-reset flow:
 * credentials → (verify | forgotPassword → resetPassword) → authenticated.
 * A successful sign-in flips the session to authenticated, which unmounts the whole
 * login screen via `AuthGate`. Add a provider (e.g. Google) by adding an action here.
 */
export function useLoginFlow(): LoginFlow {
  const { signIn, signUp, verifyOtp, resendOtp, requestPasswordReset, resetPassword } =
    useSession();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [mode, setMode] = useState<LoginMode>('signin');
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (key: keyof Fields, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  const toggleMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
  };

  const back = () => {
    setStep('credentials');
    setFields((f) => ({ ...f, otp: '' }));
    setError(null);
  };

  const forgotPassword = () => {
    setStep('forgotPassword');
    // The password field becomes the *new* password on the reset step.
    setFields((f) => ({ ...f, password: '', otp: '' }));
    setError(null);
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = () =>
    run(async () => {
      const email = fields.email.trim();
      const result =
        mode === 'signup'
          ? await signUp(email, fields.password, fields.name.trim())
          : await signIn(email, fields.password);
      // Authenticated results swap this screen out; otherwise a code was sent.
      if (result.status === 'verificationRequired') setStep('verify');
    });

  const submitOtp = () =>
    run(async () => {
      const email = fields.email.trim();
      await verifyOtp(email, fields.otp.trim());
      const result = await signIn(email, fields.password); // now verified → session
      if (result.status !== 'authenticated') {
        setError('Verified, but sign-in failed. Please try again.');
      }
    });

  const submitResetRequest = () =>
    run(async () => {
      await requestPasswordReset(fields.email.trim());
      setStep('resetPassword');
    });

  const submitReset = () =>
    run(async () => {
      const email = fields.email.trim();
      await resetPassword(email, fields.otp.trim(), fields.password);
      const result = await signIn(email, fields.password); // new password → session
      if (result.status !== 'authenticated') {
        setError('Password reset, but sign-in failed. Please try again.');
      }
    });

  const resend = async () => {
    setError(null);
    try {
      const email = fields.email.trim();
      if (step === 'resetPassword') await requestPasswordReset(email);
      else await resendOtp(email);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return {
    step,
    mode,
    fields,
    error,
    busy,
    setField,
    toggleMode,
    submitCredentials,
    submitOtp,
    forgotPassword,
    submitResetRequest,
    submitReset,
    resend,
    back,
  };
}
