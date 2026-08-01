import { useRef, useState } from 'react';
import { useShortcut } from '@/lib/shortcuts/useShortcut';

interface Options {
  /** False while an overlay (editor, dialog, prompt) owns the keyboard. */
  enabled: boolean;
}

/**
 * A keyboard "cursor" over a list — a virtual selection held in state, not real DOM
 * focus, so the rows needn't be focusable. This hook owns only the cursor: movement
 * (`↑↓`/`jk`, first press lands on the top item), `Esc` (unselect), and `advance()` for
 * actions that remove the focused item. The per-item actions themselves are shortcuts
 * the caller enables — it has the item data their hints need.
 */
export function useListCursor<T>(items: T[], getId: (item: T) => string, { enabled }: Options) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const ref = useRef({ items, getId, focusedId });
  ref.current = { items, getId, focusedId };

  const move = (delta: number) => {
    const { items, getId, focusedId } = ref.current;
    if (items.length === 0) return;
    const idx = items.findIndex((item) => getId(item) === focusedId);
    const next = items[idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), items.length - 1)];
    if (next !== undefined) setFocusedId(getId(next));
  };

  /** Move the cursor to a neighbour before the focused item leaves the list. */
  const advance = () => {
    const { items, getId, focusedId } = ref.current;
    const idx = items.findIndex((item) => getId(item) === focusedId);
    if (idx === -1) return;
    const neighbour = items[idx + 1] ?? items[idx - 1] ?? null;
    setFocusedId(neighbour ? getId(neighbour) : null);
  };

  const focused = items.find((item) => getId(item) === focusedId) ?? null;

  useShortcut('cursor.down', {
    enabled: enabled && items.length > 0,
    callback: () => move(1),
  });
  useShortcut('cursor.up', { enabled: enabled && items.length > 0, callback: () => move(-1) });
  useShortcut('cursor.unselect', {
    enabled: enabled && focusedId !== null,
    callback: () => setFocusedId(null),
  });

  return { focusedId, setFocusedId, focused, advance };
}
