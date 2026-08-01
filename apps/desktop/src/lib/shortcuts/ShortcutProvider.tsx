import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { SHORTCUT_IDS, SHORTCUTS, type Shortcut, type ShortcutId } from './shortcuts';

export interface ShortcutOptions {
  enabled?: boolean;
  callback: (e: KeyboardEvent) => void;
}

interface ShortcutContextValue {
  setShortcutOptions: (id: ShortcutId, options: Required<ShortcutOptions>) => () => void;
  subscribeToShortcutOptions: (listener: () => void) => () => void;
  getShortcutOptions: () => ReadonlyMap<ShortcutId, Required<ShortcutOptions>>;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/**
 * The shortcut system's one home, one provider per window. Every SHORTCUTS entry is bound
 * here — a static `KeyBinding` per row — and a key press looks up the connected
 * `enabled`/`callback` at fire time, so components never touch the key engine: they only
 * set their options via `useShortcut`, and the hint views subscribe to what's enabled.
 * A shortcut works exactly while a mounted component keeps it enabled — there is no other
 * gating; mounting separates the windows/screens, `enabled` separates the overlays.
 */
export function ShortcutProvider({ children }: { children: ReactNode }) {
  // Copy-on-write: every change replaces the Map, so the Map itself is the
  // useSyncExternalStore snapshot — a changed identity means "something changed".
  const store = useRef({
    shortcutOptions: new Map<ShortcutId, Required<ShortcutOptions>>(),
    listeners: new Set<() => void>(),
  }).current;

  const notify = useCallback(() => {
    for (const listener of store.listeners) listener();
  }, [store]);

  const setShortcutOptions = useCallback(
    (id: ShortcutId, options: Required<ShortcutOptions>) => {
      const next = new Map(store.shortcutOptions);
      next.set(id, options);
      store.shortcutOptions = next;
      notify();

      return () => {
        const remaining = new Map(store.shortcutOptions);
        remaining.delete(id);
        store.shortcutOptions = remaining;
        notify();
      };
    },
    [store, notify],
  );

  const subscribeToShortcutOptions = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );

  // Fire-time checks for the bindings below — stable, evaluated per keypress.
  const isEnabled = useCallback(
    (id: ShortcutId) => store.shortcutOptions.get(id)?.enabled ?? false,
    [store],
  );
  const shortcutCallback = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => store.shortcutOptions.get(id)?.callback(e),
    [store],
  );

  const value = useMemo<ShortcutContextValue>(
    () => ({
      setShortcutOptions,
      subscribeToShortcutOptions,
      getShortcutOptions: () => store.shortcutOptions,
    }),
    [setShortcutOptions, subscribeToShortcutOptions, store],
  );

  return (
    <ShortcutContext.Provider value={value}>
      {SHORTCUT_IDS.map((id) => (
        <KeyBinding key={id} id={id} isEnabled={isEnabled} shortcutCallback={shortcutCallback} />
      ))}
      {children}
    </ShortcutContext.Provider>
  );
}

// One static, render-less binding per SHORTCUTS row. `enabled` is a function, so enablement
// is evaluated per keypress — nothing here ever re-registers.
function KeyBinding({
  id,
  isEnabled,
  shortcutCallback,
}: {
  id: ShortcutId;
  isEnabled: (id: ShortcutId) => boolean;
  shortcutCallback: (id: ShortcutId, e: KeyboardEvent) => void;
}) {
  const shortcut: Shortcut = SHORTCUTS[id];
  useHotkeys(shortcut.keys, (e) => shortcutCallback(id, e), {
    enabled: () => isEnabled(id),
    preventDefault: shortcut.opts?.preventDefault ?? true,
    enableOnFormTags: shortcut.opts?.enableOnFormTags,
  });
  return null;
}

export function useShortcutContext(): ShortcutContextValue {
  const value = useContext(ShortcutContext);
  if (value === null) throw new Error('useShortcutContext requires a <ShortcutProvider>');
  return value;
}
