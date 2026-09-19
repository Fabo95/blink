import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { HintRow } from '@/components/HintRow';
import { type Page, PageNav } from '@/components/PageNav';
import { SettingsPage } from '@/components/SettingsPage';
import { TaskList } from '@/components/TaskList';
import { WorktreesPage } from '@/components/WorktreesPage';
import type { Task } from '@/generated/Task';
import { useSession } from '@/hooks/useSession';
import { useWorktreeAttention } from '@/hooks/useWorktreeAttention';
import { api, isTauri } from '@/lib/api';
import { useHintStyle } from '@/lib/hintStyle';
import { Hints } from '@/lib/shortcuts/Hints';

/** The signed-in app: capture card + task inbox. Rendered only inside `<AuthGate>`. */
export function Inbox() {
  const { user, signOut } = useSession();
  const attention = useWorktreeAttention();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState<Page>('inbox');

  const refresh = useCallback(async () => {
    setTasks(await api.listTasks());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh the inbox when the copy-capture popup saves a task, and when a sync pull
  // writes rows straight into SQLite (a task captured on another device, or filed
  // remotely through POST /v1/capture) — otherwise the list keeps showing what it
  // loaded on mount until the app restarts.
  useEffect(() => {
    if (!isTauri) return;
    const unlisteners: (() => void)[] = [];
    let active = true;
    import('@tauri-apps/api/event').then(({ listen }) => {
      for (const event of ['task-saved', 'records-merged']) {
        listen(event, () => {
          void refresh();
        }).then((fn) => {
          if (active) unlisteners.push(fn);
          else fn();
        });
      }
    });
    return () => {
      active = false;
      for (const fn of unlisteners) fn();
    };
  }, [refresh]);

  // AuthGate only renders us once authenticated; this keeps the type honest.
  if (!user) return null;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <Header account={user} onSignOut={signOut} />
      <PageNav
        page={page}
        onSelect={setPage}
        badges={{ worktrees: attention.needsInputCount }}
      />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {page === 'settings' ? (
          <SettingsPage />
        ) : page === 'worktrees' ? (
          <WorktreesPage />
        ) : (
          <TaskList tasks={tasks} onChanged={refresh} />
        )}
      </main>
      {/* One statusline: the most specific shortcuts for where you are, plus the always-on
          `c` help and vim toggle. */}
      <footer className="flex items-center justify-between gap-4 border-t border-border/50 px-6 py-3">
        <Hints />
        <div className="flex shrink-0 items-center gap-3">
          <HintRow hints={[{ keys: 'c', label: 'help' }]} />
          <HintStyleToggle />
        </div>
      </footer>
    </div>
  );
}

// The label states what pressing `v` switches TO, so the hint doubles as the mode indicator.
function HintStyleToggle() {
  const style = useHintStyle();
  return (
    <HintRow
      className="shrink-0"
      hints={[{ keys: 'v', label: style === 'vim' ? 'standard hints' : 'vim hints' }]}
    />
  );
}
