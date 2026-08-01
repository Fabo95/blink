import { Kbd } from '@/components/ui/kbd';
import { useHintStyle } from '@/lib/hintStyle';
import { cn } from '@/lib/utils';

export interface Shortcut {
  keys: string;
  vim?: string;
  label: string;
}

/** A row of `key — label` hints, rendered consistently wherever shortcuts are surfaced
 *  (inbox header, capture panels, editor footer). `v` flips the display between the
 *  standard keys and their vim synonyms — the bindings themselves always accept both. */
export function ShortcutHint({
  shortcuts,
  className,
}: {
  shortcuts: Shortcut[];
  className?: string;
}) {
  const style = useHintStyle();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      {shortcuts.map((shortcut) => (
        <span key={shortcut.label} className="flex items-center gap-1">
          <Kbd>{style === 'vim' && shortcut.vim ? shortcut.vim : shortcut.keys}</Kbd>
          {shortcut.label}
        </span>
      ))}
    </div>
  );
}
