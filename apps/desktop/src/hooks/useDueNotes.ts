import { useCallback, useEffect, useState } from 'react';
import type { Note } from '@/generated/Note';
import { api, isTauri } from '@/lib/api';

/** Notes become due by the clock alone, so re-check now and then even when nothing changed. */
const RECHECK_MS = 15 * 60 * 1000;

/**
 * Ideas and thoughts due for review, most overdue first. Re-read when `version` changes
 * (the caller's notes), when a capture or sync pull writes notes, and every 15 minutes.
 */
export function useDueNotes({ version }: { version?: unknown } = {}) {
  const [due, setDue] = useState<Note[]>([]);

  const refresh = useCallback(async () => {
    setDue(await api.listDueNotes());
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` changes whenever the caller's notes do, so the due list re-reads after edits and reviews.
  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), RECHECK_MS);
    if (!isTauri) return () => clearInterval(timer);
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
      clearInterval(timer);
      active = false;
      for (const fn of unlisteners) fn();
    };
  }, [refresh]);

  return { due, refresh };
}
