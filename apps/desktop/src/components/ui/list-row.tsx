import { type HTMLAttributes, type ReactNode, type Ref, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type RowState = 'idle' | 'focused' | 'editing' | 'confirming';

/**
 * One row of a keyboard list — the app's single row look, shared by Incoming, Worktrees, and
 * Connections (the Inbox's `TaskRow` draws the same card itself): a bordered card, the focused
 * row gets the violet left bar, an open in-row popover rings it (red for a confirm). The
 * mouse is secondary: a click selects, the row stays out of the Tab order and keeps focus on
 * the page so the shortcuts keep firing. A row scrolls itself into view when it gains focus.
 *
 * Accepts `ref` + extra props so it can be a Radix `PopoverAnchor asChild`.
 */
export function ListRow({
  state,
  onSelect,
  children,
  className,
  ref,
  ...rest
}: {
  state: RowState;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'>) {
  const node = useRef<HTMLDivElement | null>(null);
  const focused = state === 'focused';

  useEffect(() => {
    if (focused) node.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  return (
    <div
      {...rest}
      ref={(element) => {
        node.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      className={cn(
        'relative rounded-xl border border-border/60 bg-card/40 px-3.5 py-3 transition-colors',
        state !== 'idle' && 'border-primary/40 bg-card/70',
        state === 'editing' && 'ring-2 ring-primary/30',
        state === 'confirming' && 'border-destructive/50 ring-2 ring-destructive/30',
        className,
      )}
    >
      {/* Whole-card click target; content sits above it but lets clicks fall through. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        className="absolute inset-0 rounded-xl"
      />
      {focused && (
        <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
      )}
      <div className="pointer-events-none relative">{children}</div>
    </div>
  );
}
