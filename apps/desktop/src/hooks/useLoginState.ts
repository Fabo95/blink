import { useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';

export type LoginStep = 'credentials' | 'verify' | 'forgotPassword' | 'resetPassword';
export type LoginMode = 'signin' | 'signup';

export interface Fields {
  name: string;
  email: string;
  password: string;
  otp: string;
}

/**
 * The state the login steps share — only what genuinely spans forms: the current step
 * (which form the router shows), the fields carried forward (the email/password typed on
 * the credentials step feed the verify and reset steps), the busy/error status, and the
 * navigation between steps. Each form owns its own submit/resend logic via `useSession`.
 */
export interface LoginState {
  step: LoginStep;
  mode: LoginMode;
  fields: Fields;
  error: string | null;
  busy: boolean;
  setField: (key: keyof Fields, value: string) => void;
  setError: (message: string | null) => void;
  setStep: (step: LoginStep) => void;
  toggleMode: () => void;
  back: () => void;
  forgotPassword: () => void;
  /** Run a form's async submit with shared busy + error handling. */
  run: (action: () => Promise<void>) => Promise<void>;
}

const EMPTY_FIELDS: Fields = { name: '', email: '', password: '', otp: '' };

export function useLoginState(): LoginState {
  const [step, setStep] = useState<LoginStep>('credentials');
  const [mode, setMode] = useState<LoginMode>('signin');
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (key: keyof Fields, value: string) => setFields((f) => ({ ...f, [key]: value }));

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

  return {
    step,
    mode,
    fields,
    error,
    busy,
    setField,
    setError,
    setStep,
    toggleMode,
    back,
    forgotPassword,
    run,
  };
}
