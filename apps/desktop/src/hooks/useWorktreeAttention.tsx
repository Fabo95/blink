import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import type { WorktreeAttentionUpdate } from '@/generated/WorktreeAttentionUpdate';
import { api, isTauri } from '@/lib/api';

interface WorktreeAttentionView {
  /** The live attention of a worktree, or `null` when it has no running session. */
  attentionOf: (repoPath: string, branch: string) => WorktreeAttention | null;
  /** How many worktrees (across all repos) are waiting for input — the nav badge count. */
  needsInputCount: number;
}

const WorktreeAttentionContext = createContext<WorktreeAttentionView | null>(null);

const keyOf = (repoPath: string, branch: string) => `${repoPath}\n${branch}`;

/**
 * App-wide worktree attention state (one per main window, like `AiStatusProvider`). Loads
 * the initial snapshot from the core, then stays live off the `worktree-attention` window
 * event the Rust poll loop emits every couple of seconds. Drives the per-row status dots and
 * the "needs you" badge on the Worktrees nav tab, so it must sit above both — mounted around
 * the whole signed-in app. Inert notifications happen in Rust; this only reflects state.
 */
export function WorktreeAttentionProvider({ children }: { children: ReactNode }) {
  const [updates, setUpdates] = useState<WorktreeAttentionUpdate[]>([]);

  useEffect(() => {
    let active = true;
    void api
      .getWorktreeAttention()
      .then((initial) => {
        if (active) setUpdates(initial);
      })
      .catch(() => {
        // No worktrees / core unavailable — leave the dashboard blank.
      });

    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<WorktreeAttentionUpdate[]>('worktree-attention', (event) => {
        if (active) setUpdates(event.payload);
      }).then((un) => {
        if (active) unlisten = un;
        else un();
      }),
    );
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const value = useMemo<WorktreeAttentionView>(() => {
    const byKey = new Map(updates.map((u) => [keyOf(u.repo, u.branch), u.attention]));
    return {
      attentionOf: (repoPath, branch) => byKey.get(keyOf(repoPath, branch)) ?? null,
      needsInputCount: updates.filter((u) => u.attention === 'needsInput').length,
    };
  }, [updates]);

  return (
    <WorktreeAttentionContext.Provider value={value}>{children}</WorktreeAttentionContext.Provider>
  );
}

export function useWorktreeAttention(): WorktreeAttentionView {
  const ctx = useContext(WorktreeAttentionContext);
  if (ctx === null) {
    throw new Error('useWorktreeAttention must be used within a WorktreeAttentionProvider');
  }
  return ctx;
}
