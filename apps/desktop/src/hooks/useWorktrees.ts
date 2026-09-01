import { useCallback, useEffect, useState } from 'react';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export interface WorktreesView {
  worktrees: Worktree[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** Create (or attach) a worktree, then open its terminal. Rethrows so the caller can
   *  keep its prompt open on failure. */
  create: (branch: string) => Promise<void>;
  /** Remove the worktree, its session, and its local branch; `deleteRemote` also deletes
   *  the branch on GitHub. */
  remove: (branch: string, force: boolean, deleteRemote: boolean) => Promise<void>;
  openInTerminal: (branch: string) => Promise<void>;
  /** Open the worktree's folder in the configured editor. */
  openInEditor: (branch: string) => Promise<void>;
  prunePreview: () => Promise<PruneCandidate[]>;
  pruneApply: () => Promise<void>;
}

/**
 * Worktree operations for a single repo — the "worktree stuff". Given the active repo's
 * path, it loads that repo's worktrees and exposes create/remove/open/prune. It knows
 * nothing about the managed-repo list (see [`useManagedRepos`]).
 */
export function useWorktrees(repoPath: string | null): WorktreesView {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (path: string | null) => {
    if (!path) {
      setWorktrees([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setWorktrees(await api.listWorktrees(path));
    } catch (e) {
      setError(errorMessage(e, 'Could not load worktrees'));
      setWorktrees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(repoPath);
  }, [repoPath, load]);

  const refresh = useCallback(() => load(repoPath), [load, repoPath]);

  const create = useCallback(
    async (branch: string) => {
      if (!repoPath) return;
      setError('');
      try {
        await api.addWorktree(repoPath, branch);
        await api.openWorktreeInTerminal(repoPath, branch);
        await load(repoPath);
      } catch (e) {
        setError(errorMessage(e, 'Could not create the worktree'));
        throw e;
      }
    },
    [repoPath, load],
  );

  const remove = useCallback(
    async (branch: string, force: boolean, deleteRemote: boolean) => {
      if (!repoPath) return;
      setError('');
      try {
        await api.removeWorktree(repoPath, branch, force);
        if (deleteRemote) await api.deleteRemoteBranch(repoPath, branch);
        await load(repoPath);
      } catch (e) {
        setError(errorMessage(e, 'Could not remove the worktree'));
        throw e;
      }
    },
    [repoPath, load],
  );

  const openInTerminal = useCallback(
    async (branch: string) => {
      if (!repoPath) return;
      setError('');
      try {
        await api.openWorktreeInTerminal(repoPath, branch);
        await load(repoPath);
      } catch (e) {
        setError(errorMessage(e, 'Could not open the worktree'));
      }
    },
    [repoPath, load],
  );

  const openInEditor = useCallback(
    async (branch: string) => {
      if (!repoPath) return;
      setError('');
      try {
        await api.openWorktreeInEditor(repoPath, branch);
      } catch (e) {
        setError(errorMessage(e, 'Could not open the worktree in your editor'));
      }
    },
    [repoPath],
  );

  const prunePreview = useCallback(async () => {
    if (!repoPath) return [];
    setError('');
    try {
      return await api.pruneWorktrees(repoPath, false);
    } catch (e) {
      setError(errorMessage(e, 'Could not scan for prunable worktrees'));
      throw e;
    }
  }, [repoPath]);

  const pruneApply = useCallback(async () => {
    if (!repoPath) return;
    setError('');
    try {
      await api.pruneWorktrees(repoPath, true);
      await load(repoPath);
    } catch (e) {
      setError(errorMessage(e, 'Could not prune worktrees'));
      throw e;
    }
  }, [repoPath, load]);

  return {
    worktrees,
    loading,
    error,
    refresh,
    create,
    remove,
    openInTerminal,
    openInEditor,
    prunePreview,
    pruneApply,
  };
}
