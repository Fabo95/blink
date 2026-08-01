import { Kbd } from '@/components/ui/kbd';
import { useHintStyle } from '@/lib/hintStyle';
import { cn } from '@/lib/utils';

export interface Hint {
  keys: string;
  vim?: string;
  label: string;
}

/** A row of `key — label` hints, rendered consistently wherever shortcuts are surfaced
 *  (inbox header, capture panels, editor footer). `v` flips the display between the
 *  standard keys and their vim synonyms — the bindings themselves always accept both. */
export function HintRow({ hints, className }: { hints: Hint[]; className?: string }) {
  const style = useHintStyle();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      {hints.map((hint) => (
        <span key={hint.label} className="flex items-center gap-1">
          <Kbd>{style === 'vim' && hint.vim ? hint.vim : hint.keys}</Kbd>
          {hint.label}
        </span>
      ))}
    </div>
  );
}
