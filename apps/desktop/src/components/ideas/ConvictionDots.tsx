import { cn } from '@/lib/utils';

// Stronger tint for higher conviction; the number is always shown, so color is never the
// only signal.
const TINT: Record<number, string> = {
  1: 'border-border/60 text-muted-foreground',
  2: 'border-border/80 text-muted-foreground',
  3: 'border-primary/30 text-foreground',
  4: 'border-primary/50 bg-primary/10 text-foreground',
  5: 'border-primary/70 bg-primary/25 text-foreground',
};

/** A note's conviction history, oldest first, as small numbered squares (`2 3 5`). */
export function ConvictionDots({ history, max = 5 }: { history: number[]; max?: number }) {
  if (history.length === 0) return null;
  const shown = history.slice(-max);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`Conviction over time: ${history.join(', ')}`}
    >
      <span className="sr-only">Conviction over time: {history.join(', ')}</span>
      {shown.map((value, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: entries never reorder.
          key={i}
          aria-hidden
          className={cn(
            'inline-flex size-4 items-center justify-center rounded border text-[9px] font-semibold tabular-nums',
            TINT[value] ?? TINT[3],
          )}
        >
          {value}
        </span>
      ))}
    </span>
  );
}
