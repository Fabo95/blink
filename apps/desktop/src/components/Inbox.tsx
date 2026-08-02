import { useCallback, useEffect, useState } from 'react';
import { CaptureCard } from '@/components/CaptureCard';
import { Header } from '@/components/Header';
import { HintRow } from '@/components/HintRow';
import { TaskList } from '@/components/TaskList';
import type { Task } from '@/generated/Task';
import { useSession } from '@/hooks/useSession';
import { api, isTauri } from '@/lib/api';
import { useHintStyle } from '@/lib/hintStyle';
import { Hints } from '@/lib/shortcuts/Hints';

/** The signed-in app: capture card + task inbox. Rendered only inside `<AuthGate>`. */
export function Inbox() {
  const { user, signOut } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);

  const refresh = useCallback(async () => {
    setTasks(await api.listTasks());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh the inbox when the copy-capture popup saves a task.
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('task-saved', () => {
        void refresh();
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => unlisten?.();
  }, [refresh]);

  // AuthGate only renders us once authenticated; this keeps the type honest.
  if (!user) return null;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <Header account={user} onSignOut={signOut} />
      {/* Global statusline: always-available structural keys (sections, groups, filter) +
          the vim toggle — a toolbar band next to the controls they drive. */}
      <div className="flex items-start justify-between gap-4 border-b border-border/50 px-6 py-2">
        <Hints group="global" />
        <HintStyleToggle />
      </div>
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <CaptureCard />
        <TaskList tasks={tasks} onChanged={refresh} />
      </main>
      {/* Context statusline: what the focused row / open overlay can do right now. */}
      <footer className="border-t border-border/50 px-6 py-3">
        <Hints group="context" />
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
