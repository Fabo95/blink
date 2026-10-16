import { useCallback, useEffect, useState } from 'react';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export interface ManagedReposView {
  repos: ManagedRepo[];
  error: string;
  refresh: () => Promise<void>;
  /** Stop tracking a repo. Rethrows so the caller can keep its confirm open on failure. */
  remove: (path: string) => Promise<void>;
  /** Open a native folder picker and add the chosen git repo. */
  pick: () => Promise<void>;
  /** Set (or clear with an empty string) the repo's worktree setup command. Rethrows so the
   *  caller can keep its prompt open on failure. */
  setSetupCommand: (path: string, command: string) => Promise<void>;
}

/**
 * The managed-repo list + its CRUD — the "repo stuff", independent of worktree operations.
 * Used by the Settings repos card (pick/remove) and read by the Worktrees page (which only
 * needs the list, to offer a repo picker).
 */
export function useManagedRepos(): ManagedReposView {
  const [repos, setRepos] = useState<ManagedRepo[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setRepos(await api.listManagedRepos());
    } catch (e) {
      setError(errorMessage(e, 'Could not load repositories'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (path: string) => {
    setError('');
    try {
      setRepos(await api.removeManagedRepo(path));
    } catch (e) {
      setError(errorMessage(e, 'Could not remove that repository'));
      throw e;
    }
  }, []);

  const pick = useCallback(async () => {
    setError('');
    try {
      setRepos(await api.pickManagedRepo());
    } catch (e) {
      setError(errorMessage(e, 'Could not add that repository'));
    }
  }, []);

  const setSetupCommand = useCallback(async (path: string, command: string) => {
    setError('');
    try {
      setRepos(await api.setRepoSetupCommand(path, command.trim() ? command : null));
    } catch (e) {
      setError(errorMessage(e, 'Could not save the setup command'));
      throw e;
    }
  }, []);

  return { repos, error, refresh, remove, pick, setSetupCommand };
}
