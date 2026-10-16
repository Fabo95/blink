import { useCallback, useEffect, useState } from 'react';
import type { TaskWorktree } from '@/generated/TaskWorktree';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import { api } from '@/lib/api';
import { useReloadHandler } from '@/lib/reload';
import { errorMessage } from '@/lib/utils';

export interface TaskWorktreesView {
  links: TaskWorktree[];
  /** The worktree a task was started in, if any. */
  linkOf: (taskId: string) => TaskWorktree | undefined;
  /** Start the task in a worktree (brief + setup + Claude + terminal). Rethrows so the
   *  caller's prompt stays open on failure. */
  start: (taskId: string, repoPath: string, branch: string) => Promise<void>;
  starting: boolean;
  error: string;
  clearError: () => void;
}

/** Which tasks live in which worktree (`w` on a task), kept fresh with the task list. */
export function useTaskWorktrees(): TaskWorktreesView {
  const [links, setLinks] = useState<TaskWorktree[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLinks(await api.listTaskWorktrees());
    } catch (e) {
      setError(errorMessage(e, 'Could not load the task worktrees'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // A merged PR completes its task in the core (which emits `task-saved`); a removed worktree
  // drops its link — either way the links may have changed.
  useTauriEvent(['task-saved', 'records-merged'], () => void load());
  useReloadHandler(load);

  const start = useCallback(
    async (taskId: string, repoPath: string, branch: string) => {
      setStarting(true);
      setError('');
      try {
        await api.startTaskWorktree(taskId, repoPath, branch);
        await load();
      } catch (e) {
        setError(errorMessage(e, 'Could not start the worktree'));
        throw e;
      } finally {
        setStarting(false);
      }
    },
    [load],
  );

  const linkOf = useCallback(
    (taskId: string) => links.find((link) => link.taskId === taskId),
    [links],
  );

  return { links, linkOf, start, starting, error, clearError: () => setError('') };
}
