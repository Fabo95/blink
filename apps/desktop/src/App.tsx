import { useCallback, useEffect, useState } from 'react';
import { CaptureCard } from '@/components/CaptureCard';
import { Header } from '@/components/Header';
import { TaskList } from '@/components/TaskList';
import type { Task } from '@/generated/Task';
import { api, isTauri } from '@/lib/api';

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const refresh = useCallback(async () => {
    setTasks(await api.listTasks());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh the inbox when the quick-capture popup saves a task.
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

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <Header />
      <main className="flex-1 space-y-6 px-6 py-6">
        <CaptureCard onSaved={refresh} />
        <TaskList tasks={tasks} onChanged={refresh} />
      </main>
      <footer className="px-6 py-3 text-center text-[11px] tracking-wide text-muted-foreground">
        Local-First · Zero-Knowledge E2EE on sync · Blink Phase 1
      </footer>
    </div>
  );
}
