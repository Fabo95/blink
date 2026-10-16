import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A selectable pill — the one look for every filter/choice bar (task groups, topics,
 * repositories, the Settings terminal/editor pickers). Mouse-only: out of the Tab order, and
 * mousedown is prevented so focus stays on the page and the keyboard shortcuts keep firing.
 */
export function Pill({
  label,
  selected,
  onSelect,
  icon,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
        selected
          ? 'border-primary/40 bg-card/70 text-foreground'
          : 'border-border/60 bg-card/40 text-muted-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
