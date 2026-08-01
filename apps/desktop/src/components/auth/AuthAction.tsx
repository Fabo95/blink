import { useHotkeys } from 'react-hotkeys-hook';
import { Kbd } from '@/components/ui/kbd';

interface AuthActionProps {
  /** Kbd display, e.g. `⌘R`. */
  display: string;
  /** react-hotkeys binding, e.g. `mod+r`. */
  hotkey: string;
  label: string;
  onAction: () => void;
  disabled?: boolean;
}

/**
 * A secondary auth action: the shortcut, its hint chip, and a Pill-style secondary
 * click affordance in one element (out of the tab order, focus stays in the form).
 */
export function AuthAction({ display, hotkey, label, onAction, disabled = false }: AuthActionProps) {
  useHotkeys(hotkey, onAction, {
    enabled: !disabled,
    enableOnFormTags: true,
    preventDefault: true,
  });

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
