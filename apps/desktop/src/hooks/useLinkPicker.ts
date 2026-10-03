import { useState } from 'react';
import type { Note } from '@/generated/Note';
import type { NoteLink } from '@/generated/NoteLink';
import type { NoteRelation } from '@/generated/NoteRelation';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/** How many matching notes the picker lists while searching. */
const CANDIDATE_LIMIT = 8;

export const RELATIONS: NoteRelation[] = ['supports', 'contradicts', 'related'];

export interface LinkPickerView {
  /** The note links are made from, or `null` when the picker is closed. */
  note: Note | null;
  isOpen: (id: string) => boolean;
  links: NoteLink[];
  query: string;
  setQuery: (value: string) => void;
  /** `pick` a note (search, or browse existing links), then its `relation`. */
  step: 'pick' | 'relation';
  /** Notes matching the query, excluding this note and notes already linked to it. */
  candidates: Note[];
  /** The note chosen in the pick step. */
  target: Note | null;
  selected: number;
  error: string;
  open: (note: Note) => Promise<void>;
  close: () => void;
}

interface Options {
  /** Every note, to search for link targets and to name the other end of a link. */
  notes: Note[];
  onChanged: () => void;
}

function matches(note: Note, words: string[]): boolean {
  const haystack = `${note.text} ${note.title ?? ''}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * The link picker: `u` on a note opens it. Type to search for another note, `↑↓` to pick,
 * `⌘↵` to choose it, then `↑↓` + `⌘↵` for the relation (this note supports / contradicts /
 * relates to it). With an empty search the list shows the note's existing links, and `⌘⌫`
 * removes the highlighted one. `Esc` steps back, then closes.
 */
export function useLinkPicker({ notes, onChanged }: Options): LinkPickerView {
  const [note, setNote] = useState<Note | null>(null);
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [query, setQueryValue] = useState('');
  const [step, setStep] = useState<'pick' | 'relation'>('pick');
  const [target, setTarget] = useState<Note | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');

  const linkedIds = new Set(links.flatMap((l) => [l.fromNoteId, l.toNoteId]));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates =
    note && words.length > 0
      ? notes
          .filter((n) => n.id !== note.id && !linkedIds.has(n.id) && matches(n, words))
          .slice(0, CANDIDATE_LIMIT)
      : [];
  const listLength =
    step === 'relation' ? RELATIONS.length : query ? candidates.length : links.length;

  const loadLinks = async (id: string) => setLinks(await api.listNoteLinks(id));

  const open = async (next: Note) => {
    setNote(next);
    setQueryValue('');
    setStep('pick');
    setTarget(null);
    setSelected(0);
    setError('');
    try {
      await loadLinks(next.id);
    } catch (e) {
      setError(errorMessage(e, 'Could not load links'));
    }
  };

  const close = () => {
    setNote(null);
    setLinks([]);
    setQueryValue('');
    setStep('pick');
    setTarget(null);
  };

  const setQuery = (value: string) => {
    setQueryValue(value);
    setSelected(0);
  };

  const confirm = async () => {
    if (!note) return;
    if (step === 'pick') {
      const picked = candidates[selected];
      if (!picked) return;
      setTarget(picked);
      setStep('relation');
      setSelected(0);
      return;
    }
    const relation = RELATIONS[selected];
    if (!target || !relation) return;
    try {
      await api.linkNotes(note.id, target.id, relation);
      await loadLinks(note.id);
      onChanged();
      setStep('pick');
      setTarget(null);
      setQueryValue('');
      setSelected(0);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not link the notes'));
    }
  };

  const remove = async () => {
    const link = links[selected];
    if (!note || !link) return;
    try {
      await api.unlinkNotes(link.id);
      await loadLinks(note.id);
      onChanged();
      setSelected((i) => Math.max(0, Math.min(i, links.length - 2)));
    } catch (e) {
      setError(errorMessage(e, 'Could not remove the link'));
    }
  };

  const isOpen = note !== null;
  useShortcut('linkPicker.down', {
    enabled: isOpen && listLength > 0,
    callback: () => setSelected((i) => Math.min(i + 1, listLength - 1)),
  });
  useShortcut('linkPicker.up', {
    enabled: isOpen && listLength > 0,
    callback: () => setSelected((i) => Math.max(i - 1, 0)),
  });
  useShortcut('linkPicker.confirm', {
    enabled: isOpen && (step === 'relation' || candidates.length > 0),
    callback: () => void confirm(),
  });
  useShortcut('linkPicker.remove', {
    enabled: isOpen && step === 'pick' && !query && links.length > 0,
    callback: () => void remove(),
  });
  useShortcut('linkPicker.cancel', {
    enabled: isOpen,
    callback: () => {
      if (step === 'relation') {
        setStep('pick');
        setSelected(0);
      } else {
        close();
      }
    },
  });

  return {
    note,
    isOpen: (id) => note?.id === id,
    links,
    query,
    setQuery,
    step,
    candidates,
    target,
    selected,
    error,
    open,
    close,
  };
}
