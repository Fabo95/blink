import { GitBranch } from 'lucide-react';
import type { Worktree } from '@/generated/Worktree';
import { cn } from '@/lib/utils';

/**
 * One linked worktree row on the Worktrees page: branch, a dirty marker, the worktree
 * path, and whether its tmux/Claude session is live. Click-to-select (parity with the
 * task rows); the cursor + actions are keyboard shortcuts owned by the page.
 */
export function WorktreeRow({
  worktree,
  selected,
  onSelect,
}: {
  worktree: Worktree;
  selected: boolean;
  onSelect: () => void;
}) {
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
    </button>
  );
}
