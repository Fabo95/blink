import { useSyncExternalStore } from 'react';
import type { Hint } from '@/components/HintRow';
import { useShortcutContext } from './ShortcutProvider';
import { SHORTCUT_IDS, SHORTCUTS, type Shortcut, type ShortcutId } from './shortcuts';

// SHORTCUTS declaration order breaks ORDER ties, so rows are deterministic.
const SHORTCUT_INDEX = new Map<ShortcutId, number>(SHORTCUT_IDS.map((id, index) => [id, index]));

/**
 * The chips for every shortcut enabled right now, `ORDER`-sorted — a pure view over the
 * ShortcutProvider's table. Pass a `group` to narrow to that statusline row (`'global'`
 * = always-available management, `'context'` = focus/overlay-dependent, the default for
 * entries that don't set one); omit it to include every enabled chip.
 */
export function useHints(group?: 'global' | 'context'): Hint[] {
  const { subscribeToShortcutOptions, getShortcutOptions } = useShortcutContext();
  const shortcutOptions = useSyncExternalStore(subscribeToShortcutOptions, getShortcutOptions);

  const entries: { hint: Hint; order: number; index: number }[] = [];
  for (const [id, options] of shortcutOptions) {
    if (!options.enabled) continue;
    const shortcut: Shortcut = SHORTCUTS[id];
    if (!shortcut.hint) continue;
    if (group && (shortcut.group ?? 'context') !== group) continue;
    entries.push({
      hint: shortcut.hint,
      order: shortcut.order,
      index: SHORTCUT_INDEX.get(id) ?? 0,
    });
  }
  return entries.sort((a, b) => a.order - b.order || a.index - b.index).map((entry) => entry.hint);
}
