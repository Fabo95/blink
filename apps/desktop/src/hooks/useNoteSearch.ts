import { type RefObject, useEffect, useRef, useState } from 'react';
import type { Note } from '@/generated/Note';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

/** Short enough to feel live, long enough not to query on every keystroke. */
const SEARCH_DEBOUNCE_MS = 150;

export interface NoteSearchView {
  query: string;
  setQuery: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Ranked matches while a query is set, `null` otherwise (the page shows its sections). */
  results: Note[] | null;
}

/**
 * Full-text search over every note (FTS5 in the core). `s` focuses the field; like the
 * archive search, Esc inside the field clears the query first, then blurs back to the list.
 */
export function useNoteSearch({ enabled, version }: { enabled: boolean; version: unknown }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` changes whenever the notes do, so open results re-run and follow edits and deletes.
  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void api.searchNotes(trimmed).then((found) => {
        if (current) setResults(found);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, version]);

  useShortcut('ideas.search', {
    enabled,
    callback: () => searchRef.current?.focus(),
  });

  return { query, setQuery, searchRef, results } satisfies NoteSearchView;
}
