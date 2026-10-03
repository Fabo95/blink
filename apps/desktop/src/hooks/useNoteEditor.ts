import { useState } from 'react';
import type { Note } from '@/generated/Note';
import type { NoteType } from '@/generated/NoteType';
import { useAiStatus } from '@/hooks/useAiStatus';
import { api } from '@/lib/api';
import { wrapFocus } from '@/lib/focus';
import { normalizeLink } from '@/lib/link';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

export interface NoteEditor {
  note: Note | null;
  isEditing: (id: string) => boolean;
  draft: string;
  link: string;
  noteType: NoteType;
  topicId: string | null;
  improved: boolean;
  improving: boolean;
  /** Whether the draft can be improved: AI is set up, it isn't a source, and it changed
   *  since the last improve. The topic's sensitivity is the caller's check (it has the
   *  topics); the core enforces it regardless. */
  improvable: boolean;
  improve: () => Promise<void>;
  setDraft: (value: string) => void;
  setLink: (value: string) => void;
  setNoteType: (value: NoteType) => void;
  setTopicId: (value: string | null) => void;
  start: (note: Note) => void;
  cancel: () => void;
}

interface Options {
  onSaved: () => void;
  setError: (message: string) => void;
}

/**
 * The in-row note editor: draft fields, the once-per-version AI improve, and the editor's
 * commands (`⇥` / `⌘↵` / `Esc`; `⌘i` is bound by the page, which has the topics). Saving sends only what changed; the core keeps the
 * previous text as a revision, so an edit can always be undone from the history.
 */
export function useNoteEditor({ onSaved, setError }: Options): NoteEditor {
  const { enabled: aiEnabled } = useAiStatus();
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraftText] = useState('');
  const [link, setLink] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('idea');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [improved, setImproved] = useState(false);
  const [improving, setImproving] = useState(false);

  const improvable = note !== null && aiEnabled && !improved && !improving && noteType !== 'source';

  const start = (next: Note) => {
    setNote(next);
    setDraftText(next.text);
    setLink(next.link ?? '');
    setNoteType(next.noteType);
    setTopicId(next.topicId);
    setImproved(next.improved);
    setError('');
  };

  const cancel = () => {
    setNote(null);
    setDraftText('');
    setLink('');
    setNoteType('idea');
    setTopicId(null);
    setImproved(false);
  };

  const setDraft = (value: string) => {
    setDraftText(value);
    setImproved(false);
  };

  const save = async () => {
    if (!note) return;
    const text = draft.trim();
    if (!text) {
      cancel();
      return;
    }
    const patch: {
      text?: string;
      noteType?: NoteType;
      link?: string;
      topicId?: string;
      improved?: boolean;
    } = {};
    if (text !== note.text) patch.text = text;
    if (noteType !== note.noteType) patch.noteType = noteType;
    const nextLink = normalizeLink(link) ?? '';
    if (nextLink !== (note.link ?? '')) patch.link = nextLink;
    // Empty string clears the topic in the core (the link pattern).
    if ((topicId ?? '') !== (note.topicId ?? '')) patch.topicId = topicId ?? '';
    if (improved !== note.improved) patch.improved = improved;
    if (Object.keys(patch).length === 0) {
      cancel();
      return;
    }
    try {
      await api.updateNote(note.id, patch);
      cancel();
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Could not save edit'));
    }
  };

  const improve = async () => {
    const text = draft.trim();
    if (!text) return;
    setImproving(true);
    setError('');
    try {
      setDraftText(await api.improveNoteText(text, topicId));
      setImproved(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not improve text'));
    } finally {
      setImproving(false);
    }
  };

  useShortcut('noteEditor.field', {
    enabled: note !== null,
    callback: (e) => wrapFocus(e, '[data-note-field]'),
  });
  useShortcut('noteEditor.save', { enabled: note !== null, callback: () => void save() });
  useShortcut('noteEditor.cancel', {
    enabled: note !== null,
    callback: (e) => {
      // Esc inside an open picker menu closes the menu (Radix); a bare Esc cancels.
      const target = e.target;
      if (target instanceof HTMLElement && target.closest('[role="menu"]')) return;
      cancel();
    },
  });

  return {
    note,
    isEditing: (id) => note?.id === id,
    draft,
    link,
    noteType,
    topicId,
    improved,
    improving,
    improvable,
    improve,
    setDraft,
    setLink,
    setNoteType,
    setTopicId,
    start,
    cancel,
  };
}
