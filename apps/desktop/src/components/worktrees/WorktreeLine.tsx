import {
  Cloud,
  CloudOff,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import type { WorktreeStatus } from '@/generated/WorktreeStatus';
import { cn } from '@/lib/utils';

interface Badge {
  label: string;
  icon: LucideIcon;
  text: string;
}

/** How each attention state reads on the row — the dot colour + label. `grinding` pulses to
 *  signal it's actively moving; the rest are steady. */
const ATTENTION: Record<WorktreeAttention, { label: string; dot: string; text: string }> = {
  working: { label: 'grinding', dot: 'bg-primary animate-pulse', text: 'text-primary' },
  needsInput: { label: 'your turn', dot: 'bg-blink-bright', text: 'text-blink-bright' },
  done: { label: 'chilling', dot: 'bg-blink-success', text: 'text-blink-success' },
  errored: { label: 'borked', dot: 'bg-destructive', text: 'text-destructive' },
};

/** How each `WorktreeStatus` value reads — the icon + label + colour. Local git states
 *  (`local`/`pushed`/`gone`) stay quiet; PR states follow GitHub's own colours (open green,
 *  merged violet, closed red, draft grey). The status is resolved server-side, so the row
 *  just looks up the one value it's given. */
const STATUS: Record<WorktreeStatus, Badge> = {
  local: { label: 'local', icon: CloudOff, text: 'text-muted-foreground' },
  pushed: { label: 'pushed', icon: Cloud, text: 'text-foreground/70' },
  gone: { label: 'gone', icon: CloudOff, text: 'text-blink-bright' },
  draft: { label: 'draft', icon: GitPullRequestDraft, text: 'text-muted-foreground' },
  open: { label: 'open', icon: GitPullRequest, text: 'text-blink-success' },
  merged: { label: 'merged', icon: GitMerge, text: 'text-primary' },
  closed: { label: 'closed', icon: GitPullRequestClosed, text: 'text-destructive' },
};

/**
 * One linked worktree row on the Worktrees page: branch, a dirty marker, its git standing —
 * one `status` (the GitHub PR state when the branch has a PR, else the local git status:
 * local / pushed / gone) — and its Claude session's attention state (grinding / your turn /
 * chilling / borked, from reading the tmux pane), falling back to a plain idle/asleep dot
 * when there's no attention (a session with no report = idle, none = asleep). The git-status
 * chip shows a spinner while PR status is being fetched (`statusLoading`) — the list itself
 * is already up. This is the row's content; the page puts it in the shared `ListRow` (which
 * owns selection, focus, and the in-row remove confirm's anchor).
 */
export function WorktreeLine({
  worktree,
  statusLoading,
  attention,
  task,
}: {
  worktree: Worktree;
  statusLoading: boolean;
  attention: WorktreeAttention | null;
  /** The inbox task this worktree was started for (`w` on a task). */
  task?: string;
}) {
  const status = attention ? ATTENTION[attention] : null;
  const git = STATUS[worktree.status];
  const GitIcon = git.icon;
  return (
    <div>
      <div className="flex items-center gap-3">
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">{worktree.branch}</span>
        {worktree.isDirty && (
          <span className="shrink-0 text-[11px] font-medium text-blink-bright">dirty</span>
        )}
        <span className="flex-1" />
        {statusLoading ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
          </span>
        ) : (
          <span
            className={cn('flex shrink-0 items-center gap-1 text-[11px] font-medium', git.text)}
          >
            <GitIcon className="size-3" />
            {git.label}
          </span>
        )}
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
            {worktree.sessionLive ? 'idle' : 'asleep'}
          </span>
        )}
      </div>
      {task && <p className="mt-1 truncate pl-6.5 text-[11px] text-muted-foreground">{task}</p>}
    </div>
  );
}
