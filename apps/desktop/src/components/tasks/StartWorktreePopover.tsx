import { FolderGit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { PopoverContent } from '@/components/ui/popover';
import { ErrorLine, FIELD_LABEL } from '@/components/ui/section';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import { cn } from '@/lib/utils';

/**
 * Start a task in its own worktree (`w` on a task), anchored to the task's row: pick the repo
 * (`↑↓` while the branch field keeps focus, or click), adjust the suggested branch, `⌘↵`
 * starts — the worktree is created (with the repo's setup), Claude starts with the task as
 * its brief, and the terminal opens. `Esc` cancels.
 */
export function StartWorktreePopover({
  repos,
  repoPath,
  onPickRepo,
  branch,
  onBranchChange,
  aiBrief,
  starting,
  error,
}: {
  repos: ManagedRepo[];
  repoPath: string | null;
  onPickRepo: (path: string) => void;
  branch: string;
  onBranchChange: (branch: string) => void;
  /** An AI key is set, so the brief is AI-written (else it's the task itself). */
  aiBrief: boolean;
  starting: boolean;
  error: string;
}) {
  return (
    <PopoverContent align="start" sideOffset={8} className="w-96 p-3">
      <p className={cn(FIELD_LABEL, 'mb-2')}>Start in a worktree</p>
      {repos.length === 0 ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <FolderGit2 className="size-3.5" />
          Add a repository on the Worktrees page first.
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {repos.map((repo) => (
              <Pill
                key={repo.path}
                label={repo.name}
                selected={repo.path === repoPath}
                onSelect={() => onPickRepo(repo.path)}
              />
            ))}
          </div>
          <Input
            // biome-ignore lint/a11y/noAutofocus: keyboard-first — land in the branch field
            autoFocus
            value={branch}
            onChange={(e) => onBranchChange(e.target.value)}
            placeholder="branch name"
            className="h-8 font-mono text-[13px]"
          />
          <div className="mt-2 text-[11px] text-muted-foreground">
            {starting ? (
              aiBrief ? (
                'Writing the brief and creating the worktree…'
              ) : (
                'Creating the worktree…'
              )
            ) : error ? (
              <ErrorLine>{error}</ErrorLine>
            ) : aiBrief ? (
              'Claude starts with an AI-written brief of this task (its link and group context included).'
            ) : (
              'Claude starts with this task as its brief (its link and group context included).'
            )}
          </div>
        </>
      )}
    </PopoverContent>
  );
}
