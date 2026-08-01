import { useSyncExternalStore } from 'react';
import type { Shortcut } from '@/components/ShortcutHint';

// The footer statusline's content. TaskList owns the browsing context (cursor, archive,
// groups) but renders inside the scroll area, while the bar lives in Inbox's footer —
// this store bridges the two without lifting all that state.
let shortcuts: Shortcut[] = [];
const listeners = new Set<() => void>();

export function setStatusline(next: Shortcut[]) {
  // Content-equal publishes are dropped: TaskList re-publishes every render, and
  // notifying anyway would re-render the subscriber and loop right back here.
  const same =
    next.length === shortcuts.length &&
    next.every(
      (s, i) =>
        s.keys === shortcuts[i].keys &&
        s.label === shortcuts[i].label &&
        s.vim === shortcuts[i].vim,
    );
  if (same) return;
  shortcuts = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => shortcuts;

/** The shortcuts currently available in the main browsing context. */
export function useStatusline(): Shortcut[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
