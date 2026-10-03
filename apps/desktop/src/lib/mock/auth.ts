/** Browser mock: sign-in, sign-up, and the email-code flows. Any credentials work. */

import type { AuthUser } from '@/generated/AuthUser';
import type { MockHandlers } from './types';

// Browser-only auth: accept any credentials so the login gate is developable
// without the Rust core / a running server.
let mockSession: AuthUser | null = null;

export const authHandlers: MockHandlers = {
  // Sign-up always requires verification, so the OTP screen is exercisable in the browser.
  sign_up: async () => {
    return { status: 'verificationRequired', user: null };
  },
  // Any code verifies/resets; sign-in then authenticates.
  verify_email: async () => {
    return undefined;
  },
  // Any code verifies/resets; sign-in then authenticates.
  resend_verification: async () => {
    return undefined;
  },
  // Any code verifies/resets; sign-in then authenticates.
  request_password_reset: async () => {
    return undefined;
  },
  // Any code verifies/resets; sign-in then authenticates.
  reset_password: async () => {
    return undefined;
  },
  sign_in: async (args) => {
    const email = String(args?.email ?? '');
    mockSession = { id: crypto.randomUUID(), email, name: email.split('@')[0] ?? email };
    return { status: 'authenticated', user: mockSession };
  },
  sign_out: async () => {
    mockSession = null;
    return undefined;
  },
  current_session: async () => {
    return mockSession;
  },
};
