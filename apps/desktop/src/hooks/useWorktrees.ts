import { useCallback, useEffect, useRef, useState } from 'react';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreePr } from '@/generated/WorktreePr';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export interface WorktreesView {
  worktrees: Worktree[];
  loading: boolean;
  error: string;
  /** GitHub PR state per branch, keyed by branch name. Empty until the first `refreshGithub`
   *  for this repo — the page shows local git status until then; cached per repo thereafter
   *  so switching repos/tabs keeps the last-pulled state. */
  prs: Record<string, WorktreePr>;
  githubLoading: boolean;
  /** Pull PR state for the repo's branches from GitHub (`gh`) and cache it. Manual (`g`) and
   *  on window focus — costs a network call. */
  refreshGithub: () => Promise<void>;
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

/** Last-pulled GitHub PR state per repo path, kept at module scope so it survives repo
 *  switches and Worktrees-tab unmounts (a `gh` pull is expensive — don't throw it away). */
const prCache = new Map<string, Record<string, WorktreePr>>();

/**
 * Worktree operations for a single repo — the "worktree stuff". Given the active repo's
 * path, it loads that repo's worktrees and exposes create/remove/open/prune. It knows
 * nothing about the managed-repo list (see [`useManagedRepos`]).
 */
export function useWorktrees(repoPath: string | null): WorktreesView {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prs, setPrs] = useState<Record<string, WorktreePr>>({});
  const [githubLoading, setGithubLoading] = useState(false);
  // Guards against overlapping `gh` pulls (a burst of focus events, or `g` mid-refresh).
  const githubInFlight = useRef(false);

  const load = useCallback(async (path: string | null) => {
    // Show this repo's last-pulled PR state (empty until its first refresh) — cached per
    // repo so switching away and back keeps it, rather than dropping to local status.
    setPrs(path ? (prCache.get(path) ?? {}) : {});
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

  const refreshGithub = useCallback(async () => {
    if (!repoPath || githubInFlight.current) return;
    githubInFlight.current = true;
    setGithubLoading(true);
    setError('');
    try {
      const list = await api.listWorktreePullRequests(repoPath);
      const map = Object.fromEntries(list.map((pr) => [pr.branch, pr]));
      prCache.set(repoPath, map);
      setPrs(map);
    } catch (e) {
      setError(errorMessage(e, 'Could not load GitHub PR status'));
    } finally {
      githubInFlight.current = false;
      setGithubLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void load(repoPath);
  }, [repoPath, load]);

  // Re-pull PR state when the window regains focus (e.g. after merging a PR in the browser
  // and tabbing back). Only while the Worktrees page is mounted, and never overlapping runs.
  useEffect(() => {
    if (!repoPath) return;
    const onFocus = () => void refreshGithub();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [repoPath, refreshGithub]);

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
    prs,
    githubLoading,
    refreshGithub,
    refresh,
    create,
    remove,
    openInTerminal,
    openInEditor,
    prunePreview,
    pruneApply,
  };
}
