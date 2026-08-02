import { type LoginState, useLoginState } from '@/hooks/useLoginState';
import { Hints } from '@/lib/shortcuts/Hints';
import { CredentialsForm } from './CredentialsForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { VerifyForm } from './VerifyForm';

/** The auth gate's login UI — a thin router over the `useLoginState` step, with the
 *  shortcut statusline pinned to the bottom (like the inbox footer). Each step's form
 *  owns its own submit/resend logic; the shared state only carries what spans steps. */
export function LoginScreen() {
  const state = useLoginState();
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{renderStep(state)}</div>
      <footer className="flex justify-center border-t border-border/50 px-6 py-3">
        <Hints />
      </footer>
    </div>
  );
}

function renderStep(state: LoginState) {
  switch (state.step) {
    case 'verify':
      return <VerifyForm state={state} />;
    case 'forgotPassword':
      return <ForgotPasswordForm state={state} />;
    case 'resetPassword':
      return <ResetPasswordForm state={state} />;
    default:
      return <CredentialsForm state={state} />;
  }
}
