import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { HintRow } from '@/components/HintRow';
import { HomePage } from '@/components/HomePage';
import { IdeasPage } from '@/components/IdeasPage';
import { type Page, PageNav } from '@/components/PageNav';
import { SettingsPage } from '@/components/SettingsPage';
import { TaskList } from '@/components/TaskList';
import { WorktreesPage } from '@/components/WorktreesPage';
import type { Task } from '@/generated/Task';
import { useDueNotes } from '@/hooks/useDueNotes';
import { useSession } from '@/hooks/useSession';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import { useWorktreeAttention } from '@/hooks/useWorktreeAttention';
import { api } from '@/lib/api';
import { toggleHintStyle, useHintStyle } from '@/lib/hintStyle';
import { Hints } from '@/lib/shortcuts/Hints';
import { ShortcutHelp } from '@/lib/shortcuts/ShortcutHelp';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

/** The signed-in app: header, page nav, and the active page. Rendered only inside `<AuthGate>`. */
export function Inbox() {
  const { user, signOut } = useSession();
  const attention = useWorktreeAttention();
  const { due, refresh: refreshDue } = useDueNotes();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState<Page>('inbox');
  const [helpOpen, setHelpOpen] = useState(false);

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
  useTauriEvent(['task-saved', 'records-merged'], () => void refresh());

  // App-wide keys, bound once here for every page: `c` toggles the cheat-sheet (enabled
  // while it's open too, so it also closes it) and `v` flips the hint chips between the
  // standard keys and their vim synonyms. Text fields never trigger them.
  useShortcut('app.help', { callback: () => setHelpOpen((open) => !open) });
  useShortcut('app.hintDialect', { callback: toggleHintStyle });

  // AuthGate only renders us once authenticated; this keeps the type honest.
  if (!user) return null;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <Header account={user} onSignOut={signOut} />
      <PageNav
        page={page}
        onSelect={setPage}
        badges={{ ideas: due.length, worktrees: attention.needsInputCount }}
      />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {page === 'settings' ? (
          <SettingsPage />
        ) : page === 'worktrees' ? (
          <WorktreesPage />
        ) : page === 'home' ? (
          <HomePage />
        ) : page === 'ideas' ? (
          <IdeasPage
            helpOpen={helpOpen}
            onChanged={() => {
              // A review changes what's due; a promotion adds an inbox task.
              void refreshDue();
              void refresh();
            }}
          />
        ) : (
          <TaskList tasks={tasks} onChanged={refresh} helpOpen={helpOpen} />
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
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
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
