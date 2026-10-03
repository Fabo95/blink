import { useCallback, useEffect, useState } from 'react';
import type { Note } from '@/generated/Note';
import { api, isTauri } from '@/lib/api';

/**
 * Every live note, re-read when an idea is captured from another window (`note-saved`) or a
 * sync pull writes rows straight into SQLite (`records-merged`), the same two signals the
 * inbox listens to for tasks.
 */
export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);

  const refresh = useCallback(async () => {
    setNotes(await api.listNotes());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isTauri) return;
    const unlisteners: (() => void)[] = [];
    let active = true;
    void import('@tauri-apps/api/event').then(({ listen }) => {
      for (const event of ['note-saved', 'records-merged']) {
        void listen(event, () => {
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

  return { notes, refresh };
}
