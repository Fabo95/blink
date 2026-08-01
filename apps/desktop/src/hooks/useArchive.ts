import { type RefObject, useEffect, useRef, useState } from 'react';
import type { Task } from '@/generated/Task';
import { type DayGroup, groupByDay } from '@/lib/completed';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

const PAGE_SIZE = 8;

const completionTime = (task: Task) => Date.parse(task.completedAt ?? task.updatedAt);

export interface ArchiveView {
  open: boolean;
  toggle: () => void;
  query: string;
  setQuery: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Current page, 0-based and clamped to the available range. */
  page: number;
  pageCount: number;
  /** The current page, grouped by day for display. */
  groups: DayGroup[];
  /** The current page, flat and in display order — what the list cursor walks. */
  items: Task[];
  changePage: (next: number) => void;
}

interface Options {
  /** False while an overlay (editor, dialog, prompt) owns the keyboard. */
  enabled: boolean;
}

/**
 * The archive's view state over a list of older completions: expand/collapse, a text
 * search, and pagination, plus the `a` (toggle), `←→`/`hl` (page), and `/` (focus
 * search) shortcuts. While the archive is open its pager owns the horizontal keys —
 * TaskList's filter cycle only enables when it's closed. Derivation is pure — the
 * current page is sorted most-recent-first, sliced, then day-grouped.
 */
export function useArchive(archived: Task[], { enabled }: Options): ArchiveView {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? archived.filter((t) => t.text.toLowerCase().includes(trimmed))
    : archived;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const items = [...filtered]
    .sort((a, b) => completionTime(b) - completionTime(a))
    .slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const groups = groupByDay(items);

  // Jump back to the first page whenever the search narrows the set.
  useEffect(() => {
    setPage(0);
  }, [trimmed]);

  const toggle = () => {
    if (!open) {
      setQuery('');
      setPage(0);
    }
    setOpen(!open);
  };
  const changePage = (next: number) => {
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
  };

  useShortcut('archive.toggle', { enabled: enabled && archived.length > 0, callback: toggle });
  // `/` (vim search) focuses the box; the default preventDefault keeps the slash out of it.
  useShortcut('archive.search', {
    enabled: enabled && open,
    callback: () => searchRef.current?.focus(),
  });
  const canPage = enabled && open && pageCount > 1;
  useShortcut('archive.prevPage', {
    enabled: canPage,
    callback: () => changePage(clampedPage - 1),
  });
  useShortcut('archive.nextPage', {
    enabled: canPage,
    callback: () => changePage(clampedPage + 1),
  });

  return {
    open,
    toggle,
    query,
    setQuery,
    searchRef,
    page: clampedPage,
    pageCount,
    groups,
    items,
    changePage,
  };
}
