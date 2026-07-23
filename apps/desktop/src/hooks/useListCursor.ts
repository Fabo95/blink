import { useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

interface ListCursorActions<T> {
  /** Primary action (⏎) — the cursor advances to a neighbour first, since it removes the item. */
  onEnter?: (item: T) => void;
  /** Edit action (e) — keeps the cursor in place. */
  onEdit?: (item: T) => void;
  /** Delete action (⌫ / Del) — the cursor is left in place (the caller may confirm first). */
  onDelete?: (item: T) => void;
  /** Open-link action (o) — leaves the cursor in place. */
  onOpenLink?: (item: T) => void;
  /** Move the focused item up (⌥↑) — the cursor follows it, so it stays put. */
  onMoveUp?: (item: T) => void;
  /** Move the focused item down (⌥↓). */
  onMoveDown?: (item: T) => void;
  /** Suspend all shortcuts (e.g. while an editor is open). */
  disabled?: boolean;
}

/**
 * A keyboard "cursor" over a list — a virtual selection held in state, not real DOM
 * focus, so the rows needn't be focusable. Key binding is delegated to
 * `react-hotkeys-hook` (which ignores typing in form fields for free); this hook owns
 * only the cursor position and the movement/action semantics.
 *
 * `↑`/`↓` (or `j`/`k`) move it — the first press from nothing lands on the top item.
 * `⏎` runs `onEnter`, `e` runs `onEdit`, `⌫`/`Del` runs `onDelete`, `Esc` clears the
 * cursor. A stable ref feeds the handlers fresh state, so nothing re-binds on render.
 */
export function useListCursor<T>(
  items: T[],
  getId: (item: T) => string,
  actions: ListCursorActions<T> = {},
) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const ref = useRef({ items, getId, focusedId, actions });
  ref.current = { items, getId, focusedId, actions };

  const enabled = !actions.disabled;
  const canAct = enabled && focusedId !== null;

  const move = (delta: number) => {
    const { items, getId, focusedId } = ref.current;
    if (items.length === 0) return;
    const idx = items.findIndex((item) => getId(item) === focusedId);
    const next = idx === -1 ? 0 : Math.min(Math.max(idx + delta, 0), items.length - 1);
    setFocusedId(getId(items[next]));
  };

  const act = (
    pick: (a: ListCursorActions<T>) => ((item: T) => void) | undefined,
    advance: boolean,
  ) => {
    const { items, getId, focusedId, actions } = ref.current;
    const idx = items.findIndex((item) => getId(item) === focusedId);
    if (idx === -1) return;
    if (advance) {
      // Move to a neighbour before the item leaves, so the cursor keeps its place.
      const neighbour = items[idx + 1] ?? items[idx - 1] ?? null;
      setFocusedId(neighbour ? getId(neighbour) : null);
    }
    pick(actions)?.(items[idx]);
  };

  // Radix dialogs/menus trap focus but keydowns still reach this document-level handler;
  // ignore keys that came from inside one, so an open overlay's own shortcuts win.
  const guard = (fn: () => void) => (e: KeyboardEvent) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
      return;
    }
    fn();
  };

  // preventDefault so a key that opens the editor / deletes doesn't also type into the
  // field that just autofocused (or trigger a browser back-nav on Backspace).
  useHotkeys('down, j', guard(() => move(1)), { enabled, preventDefault: true });
  useHotkeys('up, k', guard(() => move(-1)), { enabled, preventDefault: true });
  useHotkeys('escape', guard(() => setFocusedId(null)), { enabled: canAct });
  useHotkeys('enter', guard(() => act((a) => a.onEnter, true)), {
    enabled: canAct,
    preventDefault: true,
  });
  useHotkeys('e', guard(() => act((a) => a.onEdit, false)), {
    enabled: canAct,
    preventDefault: true,
  });
  useHotkeys('o', guard(() => act((a) => a.onOpenLink, false)), {
    enabled: canAct,
    preventDefault: true,
  });
  useHotkeys('backspace, delete', guard(() => act((a) => a.onDelete, false)), {
    enabled: canAct,
    preventDefault: true,
  });
  // ⌥↑/⌥↓ reorder without moving the cursor off the item (it keeps the same id).
  useHotkeys('alt+up', guard(() => act((a) => a.onMoveUp, false)), {
    enabled: canAct,
    preventDefault: true,
  });
  useHotkeys('alt+down', guard(() => act((a) => a.onMoveDown, false)), {
    enabled: canAct,
    preventDefault: true,
  });

  return { focusedId, setFocusedId };
}
