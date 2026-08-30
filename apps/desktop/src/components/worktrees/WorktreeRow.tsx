import { GitBranch } from 'lucide-react';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import { cn } from '@/lib/utils';

/** How each attention state reads on the row — the dot colour + label. `working` pulses to
 *  signal it's actively moving; the rest are steady. */
const ATTENTION: Record<WorktreeAttention, { label: string; dot: string; text: string }> = {
  working: { label: 'working', dot: 'bg-primary animate-pulse', text: 'text-primary' },
  needsInput: { label: 'needs you', dot: 'bg-blink-bright', text: 'text-blink-bright' },
  done: { label: 'done', dot: 'bg-blink-success', text: 'text-blink-success' },
  errored: { label: 'error', dot: 'bg-destructive', text: 'text-destructive' },
};

/**
 * One linked worktree row on the Worktrees page: branch, a dirty marker, the worktree
 * path, and its Claude session's attention state (working / needs you / done / errored,
 * from reading the tmux pane) — falling back to a plain live/idle dot when there's no live
 * session. Click-to-select (parity with the task rows); the cursor + actions are keyboard
 * shortcuts owned by the page.
 */
export function WorktreeRow({
  worktree,
  attention,
  selected,
  onSelect,
}: {
  worktree: Worktree;
  attention: WorktreeAttention | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = attention ? ATTENTION[attention] : null;
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        selected ? 'border-primary/40 bg-card/70' : 'border-transparent hover:bg-card/40',
      )}
    >
      <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-sm text-foreground">{worktree.branch}</span>
      {worktree.isDirty && (
        <span className="shrink-0 text-[11px] font-medium text-blink-bright">dirty</span>
      )}
      <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted-foreground">
        {worktree.path}
      </span>
      {status ? (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-[11px] font-medium',
            status.text,
          )}
        >
          <span className={cn('size-1.5 rounded-full', status.dot)} />
          {status.label}
        </span>
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-[11px] font-medium',
            worktree.sessionLive ? 'text-blink-success' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              worktree.sessionLive ? 'bg-blink-success' : 'bg-muted-foreground/40',
            )}
          />
          {worktree.sessionLive ? 'live' : 'idle'}
        </span>
      )}
    </button>
  );
}
