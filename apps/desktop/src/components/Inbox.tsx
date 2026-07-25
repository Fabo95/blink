import { useCallback, useEffect, useState } from 'react';
import { CaptureCard } from '@/components/CaptureCard';
import { Header } from '@/components/Header';
import { TaskList } from '@/components/TaskList';
import type { Task } from '@/generated/Task';
import { useSession } from '@/hooks/useSession';
import { api, isTauri } from '@/lib/api';

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
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <CaptureCard />
        <TaskList tasks={tasks} onChanged={refresh} />
      </main>
      <footer className="px-6 py-3 text-center text-[11px] tracking-wide text-muted-foreground">
        Local-First · Zero-Knowledge E2EE on sync · Blink Phase 1
      </footer>
    </div>
  );
}
