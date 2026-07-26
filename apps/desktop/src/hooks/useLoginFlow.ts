import { useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { errorMessage } from '@/lib/errorMessage';

export type LoginStep = 'credentials' | 'verify';
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
  resend: () => Promise<void>;
  back: () => void;
}

const EMPTY_FIELDS: Fields = { name: '', email: '', password: '', otp: '' };

/**
 * The sign-in/up + email-verification flow: credentials → (verify) → authenticated.
 * A successful sign-in flips the session to authenticated, which unmounts the whole
 * login screen via `AuthGate`. Add a provider (e.g. Google) by adding an action here.
 */
export function useLoginFlow(): LoginFlow {
  const { signIn, signUp, verifyOtp, resendOtp } = useSession();
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

  const submitCredentials = async () => {
    setError(null);
    setBusy(true);
    try {
      const email = fields.email.trim();
      const result =
        mode === 'signup'
          ? await signUp(email, fields.password, fields.name.trim())
          : await signIn(email, fields.password);
      // Authenticated results swap this screen out; otherwise a code was sent.
      if (result.status === 'verificationRequired') setStep('verify');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const email = fields.email.trim();
      await verifyOtp(email, fields.otp.trim());
      const result = await signIn(email, fields.password); // now verified → session
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
      await resendOtp(fields.email.trim());
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
    resend,
    back,
  };
}
