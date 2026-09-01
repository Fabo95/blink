import {
  Cloud,
  CloudOff,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from 'lucide-react';
import type { GitRemoteStatus } from '@/generated/GitRemoteStatus';
import type { PrState } from '@/generated/PrState';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import type { WorktreePr } from '@/generated/WorktreePr';
import { cn } from '@/lib/utils';

interface Badge {
  label: string;
  icon: LucideIcon;
  text: string;
}

/** How each attention state reads on the row — the dot colour + label. `working` pulses to
 *  signal it's actively moving; the rest are steady. */
const ATTENTION: Record<WorktreeAttention, { label: string; dot: string; text: string }> = {
  working: { label: 'working', dot: 'bg-primary animate-pulse', text: 'text-primary' },
  needsInput: { label: 'needs you', dot: 'bg-blink-bright', text: 'text-blink-bright' },
  done: { label: 'done', dot: 'bg-blink-success', text: 'text-blink-success' },
  errored: { label: 'error', dot: 'bg-destructive', text: 'text-destructive' },
};

/** The branch's local git standing, shown until a GitHub refresh (`g`) upgrades it to a PR
 *  state. `merged`/`gone` mark a done branch; `published` vs `local` answers "is it on origin".
 *  Local `merged` shares merged-PR's colour so "merged" reads the same however it was found. */
const REMOTE: Record<GitRemoteStatus, Badge> = {
  local: { label: 'local', icon: CloudOff, text: 'text-muted-foreground' },
  published: { label: 'pushed', icon: Cloud, text: 'text-foreground/70' },
  merged: { label: 'merged', icon: GitMerge, text: 'text-primary' },
  gone: { label: 'gone', icon: CloudOff, text: 'text-blink-bright' },
};

/** The branch's GitHub PR state (once refreshed) — the authoritative merge signal. Colours
 *  follow GitHub's own: open green, merged violet, closed red, draft grey. */
const PR: Record<PrState, Badge> = {
  draft: { label: 'draft', icon: GitPullRequestDraft, text: 'text-muted-foreground' },
  open: { label: 'open', icon: GitPullRequest, text: 'text-blink-success' },
  merged: { label: 'merged', icon: GitMerge, text: 'text-primary' },
  closed: { label: 'closed', icon: GitPullRequestClosed, text: 'text-destructive' },
};

/**
 * One linked worktree row on the Worktrees page: branch, a dirty marker, its git standing —
 * the local remote status (local / pushed / merged / gone), upgraded to the GitHub PR state
 * (draft / open / merged / closed) once refreshed with `g` — and its Claude session's
 * attention state (working / needs you / done / errored, from reading the tmux pane), falling
 * back to a plain live/idle dot when there's no live session. Click-to-select (parity with
 * the task rows); the cursor + actions are keyboard shortcuts owned by the page.
 */
export function WorktreeRow({
  worktree,
  pr,
  attention,
  selected,
  onSelect,
}: {
  worktree: Worktree;
  pr: WorktreePr | null;
  attention: WorktreeAttention | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = attention ? ATTENTION[attention] : null;
  const git = pr ? PR[pr.state] : REMOTE[worktree.remoteStatus];
  const GitIcon = git.icon;
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
      <span className="flex-1" />
      <span className={cn('flex shrink-0 items-center gap-1 text-[11px] font-medium', git.text)}>
        <GitIcon className="size-3" />
        {git.label}
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
