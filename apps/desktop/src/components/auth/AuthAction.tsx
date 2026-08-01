import { Kbd } from '@/components/ui/kbd';
import type { ShortcutId } from '@/lib/shortcuts/keymap';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

interface AuthActionProps {
  command: ShortcutId;
  /** Kbd display, e.g. `⌘r`. */
  display: string;
  label: string;
  onAction: () => void;
  disabled?: boolean;
}

/**
 * A secondary auth action: the command, its chip, and a Pill-style secondary click
 * affordance in one element (out of the tab order, focus stays in the form). The chip
 * renders here (it must be clickable), so the keymap entry carries no hint.
 */
export function AuthAction({
  command,
  display,
  label,
  onAction,
  disabled = false,
}: AuthActionProps) {
  useShortcut(command, { enabled: !disabled, callback: onAction });

  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAction}
      className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-50"
    >
      <Kbd>{display}</Kbd>
      {label}
    </button>
  );
}
