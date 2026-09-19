import { useCallback, useEffect, useRef, useState } from 'react';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export interface WorktreesView {
  worktrees: Worktree[];
  /** The worktree list itself is loading (fast, local git only). */
  loading: boolean;
  /** The GitHub PR status is being fetched (a second, network pass after the list). Drives
   *  the per-row status-badge spinner — the list is already visible while this is true. */
  statusLoading: boolean;
  error: string;
  /** Reload the list (fast local pass) then re-fetch PR status. Bound to `g` and window focus. */
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
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');
  // The repo the latest load() is for — so a slow PR-status response for a repo we've since
  // switched away from is dropped instead of overwriting the current one.
  const activeRepo = useRef<string | null>(null);

  // Second pass: fetch GitHub PR status and overlay it onto the branches that have a PR.
  const loadStatuses = useCallback(async (path: string) => {
    setStatusLoading(true);
    try {
      const prs = await api.listWorktreePrStatuses(path);
      if (activeRepo.current !== path) return;
      setWorktrees((prev) => prev.map((w) => ({ ...w, status: prs[w.branch] ?? w.status })));
    } catch {
      // Best-effort: no gh / not a GitHub repo — leave the local statuses as they are.
    } finally {
      if (activeRepo.current === path) setStatusLoading(false);
    }
  }, []);

  const load = useCallback(
    async (path: string | null) => {
      activeRepo.current = path;
      setStatusLoading(false);
      if (!path) {
        setWorktrees([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const wts = await api.listWorktrees(path);
        if (activeRepo.current !== path) return;
        setWorktrees(wts);
        // Enrich with PR status only once the fast list is on screen.
        if (wts.length) void loadStatuses(path);
      } catch (e) {
        if (activeRepo.current !== path) return;
        setError(errorMessage(e, 'Could not load worktrees'));
        setWorktrees([]);
      } finally {
        if (activeRepo.current === path) setLoading(false);
      }
    },
    [loadStatuses],
  );

  useEffect(() => {
    void load(repoPath);
  }, [repoPath, load]);

  const refresh = useCallback(() => load(repoPath), [load, repoPath]);

  // Reload when the window regains focus (e.g. after merging a PR in the browser and tabbing
  // back) so the PR-resolved status refreshes without needing an explicit `g`.
  useEffect(() => {
    if (!repoPath) return;
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [repoPath, refresh]);

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
    statusLoading,
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
