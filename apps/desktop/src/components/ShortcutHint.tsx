import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';

export interface Shortcut {
  keys: string;
  label: string;
}

/** A row of `key — label` hints, rendered consistently wherever shortcuts are surfaced
 *  (inbox header, capture panels, editor footer). */
export function ShortcutHint({
  shortcuts,
  className,
}: {
  shortcuts: Shortcut[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      {shortcuts.map((shortcut) => (
        <span key={shortcut.label} className="flex items-center gap-1">
          <Kbd>{shortcut.keys}</Kbd>
          {shortcut.label}
        </span>
      ))}
    </div>
  );
}
