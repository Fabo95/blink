import { useCallback, useEffect, useState } from 'react';
import type { Note } from '@/generated/Note';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import { api } from '@/lib/api';

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

  useTauriEvent(['note-saved', 'records-merged'], () => void refresh());

  return { notes, refresh };
}
