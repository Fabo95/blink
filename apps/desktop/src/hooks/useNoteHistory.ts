import { useState } from 'react';
import type { Note } from '@/generated/Note';
import type { NoteRevision } from '@/generated/NoteRevision';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

export interface NoteHistoryView {
  note: Note | null;
  isOpen: (id: string) => boolean;
  revisions: NoteRevision[];
  /** Index into `revisions` of the version `⌘↵` restores. */
  selected: number;
  open: (note: Note) => Promise<void>;
  close: () => void;
}

interface Options {
  onRestored: () => void;
  setError: (message: string) => void;
}

/**
 * A note's earlier versions in an in-row popover: `↑↓`/`jk` pick a version, `⌘↵` restores it
 * (the current text becomes a version itself, so restoring never loses anything), `Esc`
 * closes. Opening the history also clears the note's sync-conflict marker in the core.
 */
export function useNoteHistory({ onRestored, setError }: Options): NoteHistoryView {
  const [note, setNote] = useState<Note | null>(null);
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [selected, setSelected] = useState(0);

  const open = async (next: Note) => {
    try {
      const loaded = await api.noteHistory(next.id);
      setRevisions(loaded);
      setSelected(0);
      setNote(next);
      // The conflict marker was just cleared in the core; reflect it in the list.
      if (next.conflict) onRestored();
    } catch (e) {
      setError(errorMessage(e, 'Could not load history'));
    }
  };

  const close = () => {
    setNote(null);
    setRevisions([]);
    setSelected(0);
  };

  const restore = async () => {
    const revision = revisions[selected];
    if (!note || !revision) return;
    try {
      await api.restoreNoteRevision(note.id, revision.id);
      close();
      onRestored();
    } catch (e) {
      setError(errorMessage(e, 'Could not restore version'));
    }
  };

  const isOpen = note !== null;
  const canMove = isOpen && revisions.length > 1;
  useShortcut('history.down', {
    enabled: canMove,
    callback: () => setSelected((i) => Math.min(i + 1, revisions.length - 1)),
  });
  useShortcut('history.up', {
    enabled: canMove,
    callback: () => setSelected((i) => Math.max(i - 1, 0)),
  });
  useShortcut('history.restore', {
    enabled: isOpen && revisions.length > 0,
    callback: () => void restore(),
  });
  useShortcut('history.close', { enabled: isOpen, callback: close });

  return { note, isOpen: (id) => note?.id === id, revisions, selected, open, close };
}
