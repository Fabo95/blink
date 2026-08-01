import { type ReactNode, useRef } from 'react';
import { Hints } from '@/lib/shortcuts/Hints';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

interface AuthFormProps {
  /** Submit verb — becomes the ⌘↵ hint label (lowercased). */
  label: string;
  busyLabel: string;
  busy: boolean;
  /** Defaults to `busy`; pass extra conditions (e.g. an incomplete OTP) when needed. */
  disabled?: boolean;
  onSubmit: () => void;
  /** Secondary `AuthAction`s, rendered left-aligned on the hint row after ⌘↵ (Esc last). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The shared auth form shell: button-free like the rest of the app. ⌘↵ is the only
 * submit — `requestSubmit()` keeps native validation and the submit event — and renders
 * the hint + busy status row under the fields.
 */
export function AuthForm({
  label,
  busyLabel,
  busy,
  disabled = busy,
  onSubmit,
  actions,
  children,
}: AuthFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  useShortcut('auth.submit', {
    hint: { keys: '⌘↵', label: label.toLowerCase() },
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
      {/* One row, hints left (registry chip + clickable secondary actions), busy right. */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Hints />
          {actions}
        </div>
        {busy && <span className="shrink-0 text-[11px] text-muted-foreground">{busyLabel}</span>}
      </div>
    </form>
  );
}
