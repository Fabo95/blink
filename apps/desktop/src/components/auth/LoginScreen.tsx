import { useLoginFlow } from '@/hooks/useLoginFlow';
import { CredentialsForm } from './CredentialsForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { VerifyForm } from './VerifyForm';

/** The auth gate's login UI — a thin router over the `useLoginFlow` state machine. */
export function LoginScreen() {
  const flow = useLoginFlow();
  switch (flow.step) {
    case 'verify':
      return <VerifyForm flow={flow} />;
    case 'forgotPassword':
      return <ForgotPasswordForm flow={flow} />;
    case 'resetPassword':
      return <ResetPasswordForm flow={flow} />;
    default:
      return <CredentialsForm flow={flow} />;
  }
}
