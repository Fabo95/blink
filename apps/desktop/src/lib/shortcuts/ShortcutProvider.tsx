import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { Hint } from '@/components/HintRow';
import { KEYMAP, SHORTCUT_IDS, type ShortcutDef, type ShortcutId } from './keymap';

/** What a component contributes for a keymap entry: enablement + the handler (+ a
 *  dynamic hint when the KEYMAP's static label doesn't fit). */
export interface ShortcutOptions {
  /** Gates BOTH firing and the chip. Omit for always-on while the component is mounted. */
  enabled?: boolean;
  callback: (e: KeyboardEvent) => void;
  /** Override the keymap's hint — for dynamic labels (`↵ complete`/`restore`). */
  hint?: Hint | null;
}

interface ShortcutContextValue {
  /** Wire a component's options to a keymap entry; returns the cleanup. */
  setShortcutOptions: (id: ShortcutId, options: Required<ShortcutOptions>) => () => void;
  subscribeToShortcuts: (listener: () => void) => () => void;
  getShortcuts: () => ReadonlyMap<ShortcutId, Required<ShortcutOptions>>;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/**
 * The shortcut system's one home, one provider per window. Every KEYMAP entry is bound
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
    shortcuts: new Map<ShortcutId, Required<ShortcutOptions>>(),
    listeners: new Set<() => void>(),
  }).current;

  const notify = useCallback(() => {
    for (const listener of store.listeners) listener();
  }, [store]);

  const setShortcutOptions = useCallback(
    (id: ShortcutId, options: Required<ShortcutOptions>) => {
      const next = new Map(store.shortcuts);
      next.set(id, options);
      store.shortcuts = next;
      notify();

      return () => {
        const remaining = new Map(store.shortcuts);
        remaining.delete(id);
        store.shortcuts = remaining;
        notify();
      };
    },
    [store, notify],
  );

  const subscribeToShortcuts = useCallback(
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
    (id: ShortcutId) => store.shortcuts.get(id)?.enabled ?? false,
    [store],
  );
  const shortcutCallback = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => store.shortcuts.get(id)?.callback(e),
    [store],
  );

  const value = useMemo<ShortcutContextValue>(
    () => ({
      setShortcutOptions,
      subscribeToShortcuts,
      getShortcuts: () => store.shortcuts,
    }),
    [setShortcutOptions, subscribeToShortcuts, store],
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

// One static, render-less binding per KEYMAP row. `enabled` is a function, so enablement
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
  const def: ShortcutDef = KEYMAP[id];
  useHotkeys(def.keys, (e) => shortcutCallback(id, e), {
    enabled: () => isEnabled(id),
    preventDefault: def.opts?.preventDefault ?? true,
    enableOnFormTags: def.opts?.enableOnFormTags,
  });
  return null;
}

export function useShortcutContext(): ShortcutContextValue {
  const value = useContext(ShortcutContext);
  if (value === null) throw new Error('useShortcutContext requires a <ShortcutProvider>');
  return value;
}
