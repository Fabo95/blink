import { type ReactNode, useRef } from 'react';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

interface AuthFormProps {
  busyLabel: string;
  busy: boolean;
  /** Defaults to `busy`; pass extra conditions (e.g. an incomplete OTP) when needed. */
  disabled?: boolean;
  onSubmit: () => void;
  children: ReactNode;
}

/**
 * The shared auth form shell: button-free like the rest of the app. ⌘↵ is the only
 * submit — `requestSubmit()` keeps native validation and the submit event. Secondary
 * actions are keyboard-only; their hints show in the LoginScreen statusline.
 */
export function AuthForm({ busyLabel, busy, disabled = busy, onSubmit, children }: AuthFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  useShortcut('auth.submit', {
    enabled: !disabled,
    callback: () => formRef.current?.requestSubmit(),
  });

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      // Without a submit button, single-field forms would still implicitly submit on
      // plain Enter — swallow it so ⌘↵ stays the one confirm key, app-wide.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) e.preventDefault();
      }}
      className="space-y-4"
    >
      {children}
      {busy && <p className="text-[11px] text-muted-foreground">{busyLabel}</p>}
    </form>
  );
}
