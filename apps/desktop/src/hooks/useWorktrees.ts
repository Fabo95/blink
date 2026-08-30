import { useCallback, useEffect, useState } from 'react';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export interface WorktreesView {
  repos: ManagedRepo[];
  activeRepo: ManagedRepo | null;
  selectRepo: (path: string) => void;
  cycleRepo: (delta: number) => void;
  worktrees: Worktree[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** Create (or attach) a worktree, then open its terminal. Rethrows so the caller can
   *  keep its prompt open on failure. */
  create: (branch: string) => Promise<void>;
  remove: (branch: string, force: boolean) => Promise<void>;
  open: (branch: string) => Promise<void>;
  prunePreview: () => Promise<PruneCandidate[]>;
  pruneApply: () => Promise<void>;
}

/**
 * Data + actions for the Worktrees page: the managed repos, the active repo's worktrees,
 * and the create/remove/open/prune operations. The keyboard cursor over the worktree list
 * is the page's own (`useListCursor`); this hook owns everything else.
 */
export function useWorktrees(): WorktreesView {
  const [repos, setRepos] = useState<ManagedRepo[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.listManagedRepos();
        setRepos(list);
        setActivePath((current) => current ?? list[0]?.path ?? null);
      } catch (e) {
        setError(errorMessage(e, 'Could not load repositories'));
      }
    })();
  }, []);

  const loadWorktrees = useCallback(async (path: string | null) => {
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
    void loadWorktrees(activePath);
  }, [activePath, loadWorktrees]);

  const refresh = useCallback(() => loadWorktrees(activePath), [loadWorktrees, activePath]);

  const activeRepo = repos.find((repo) => repo.path === activePath) ?? null;

  const selectRepo = useCallback((path: string) => setActivePath(path), []);

  const cycleRepo = useCallback(
    (delta: number) =>
      setActivePath((current) => {
        if (repos.length === 0) return current;
        const idx = Math.max(
          0,
          repos.findIndex((repo) => repo.path === current),
        );
        return repos[(idx + delta + repos.length) % repos.length]?.path ?? current;
      }),
    [repos],
  );

  const create = useCallback(
    async (branch: string) => {
      if (!activePath) return;
      setError('');
      try {
        await api.addWorktree(activePath, branch);
        await api.openWorktree(activePath, branch);
        await loadWorktrees(activePath);
      } catch (e) {
        setError(errorMessage(e, 'Could not create the worktree'));
        throw e;
      }
    },
    [activePath, loadWorktrees],
  );

  const remove = useCallback(
    async (branch: string, force: boolean) => {
      if (!activePath) return;
      setError('');
      try {
        await api.removeWorktree(activePath, branch, force);
        await loadWorktrees(activePath);
      } catch (e) {
        setError(errorMessage(e, 'Could not remove the worktree'));
        throw e;
      }
    },
    [activePath, loadWorktrees],
  );

  const open = useCallback(
    async (branch: string) => {
      if (!activePath) return;
      setError('');
      try {
        await api.openWorktree(activePath, branch);
        await loadWorktrees(activePath);
      } catch (e) {
        setError(errorMessage(e, 'Could not open the worktree'));
      }
    },
    [activePath, loadWorktrees],
  );

  const prunePreview = useCallback(async () => {
    if (!activePath) return [];
    return api.pruneWorktrees(activePath, false);
  }, [activePath]);

  const pruneApply = useCallback(async () => {
    if (!activePath) return;
    setError('');
    try {
      await api.pruneWorktrees(activePath, true);
      await loadWorktrees(activePath);
    } catch (e) {
      setError(errorMessage(e, 'Could not prune worktrees'));
      throw e;
    }
  }, [activePath, loadWorktrees]);

  return {
    repos,
    activeRepo,
    selectRepo,
    cycleRepo,
    worktrees,
    loading,
    error,
    refresh,
    create,
    remove,
    open,
    prunePreview,
    pruneApply,
  };
}
