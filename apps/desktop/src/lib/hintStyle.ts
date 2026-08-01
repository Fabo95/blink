import { useSyncExternalStore } from 'react';

export type HintStyle = 'standard' | 'vim';

// Purely a display preference for the hint chips — no Rust or capture-window consumer,
// so it stays webview-local (localStorage) instead of going through the settings table.
const STORAGE_KEY = 'hint-style';

let style: HintStyle = localStorage.getItem(STORAGE_KEY) === 'vim' ? 'vim' : 'standard';
const listeners = new Set<() => void>();

export function toggleHintStyle() {
  style = style === 'vim' ? 'standard' : 'vim';
  localStorage.setItem(STORAGE_KEY, style);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => style;

/** The current hint display style; re-renders subscribers when `v` toggles it. */
export function useHintStyle(): HintStyle {
  return useSyncExternalStore(subscribe, getSnapshot);
}
