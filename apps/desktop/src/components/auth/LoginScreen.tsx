import type { LoginFlow } from '@/hooks/useLoginFlow';
import { useLoginFlow } from '@/hooks/useLoginFlow';
import { Hints } from '@/lib/shortcuts/Hints';
import { CredentialsForm } from './CredentialsForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { VerifyForm } from './VerifyForm';

/** The auth gate's login UI — a thin router over the `useLoginFlow` state machine, with
 *  the shortcut statusline pinned to the bottom (like the inbox footer). */
export function LoginScreen() {
  const flow = useLoginFlow();
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{renderStep(flow)}</div>
      <footer className="flex justify-center border-t border-border/50 px-6 py-3">
        <Hints />
      </footer>
    </div>
  );
}

function renderStep(flow: LoginFlow) {
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
