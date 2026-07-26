import { useLoginFlow } from '@/hooks/useLoginFlow';
import { CredentialsForm } from './CredentialsForm';
import { VerifyForm } from './VerifyForm';

/** The auth gate's login UI — a thin router over the `useLoginFlow` state machine. */
export function LoginScreen() {
  const flow = useLoginFlow();
  return flow.step === 'verify' ? <VerifyForm flow={flow} /> : <CredentialsForm flow={flow} />;
}
