import { useSyncExternalStore } from 'react';
import type { Hint } from '@/components/HintRow';
import { KEYMAP, SHORTCUT_IDS, type ShortcutDef, type ShortcutId } from './keymap';
import { useShortcutContext } from './ShortcutProvider';

// KEYMAP declaration order breaks ORDER ties, so rows are deterministic.
const KEYMAP_INDEX = new Map<ShortcutId, number>(SHORTCUT_IDS.map((id, index) => [id, index]));

/**
 * The chips for every shortcut enabled right now — a pure view over the
 * ShortcutProvider's table. Entries without a hint (surfaced by control-local chips)
 * never show here.
 */
export function useHints(): Hint[] {
  const { subscribeToShortcuts, getShortcuts } = useShortcutContext();
  const shortcuts = useSyncExternalStore(subscribeToShortcuts, getShortcuts);

  const entries: { hint: Hint; order: number; index: number }[] = [];
  for (const [id, options] of shortcuts) {
    if (!options.enabled || !options.hint) continue;
    const def: ShortcutDef = KEYMAP[id];
    entries.push({ hint: options.hint, order: def.order, index: KEYMAP_INDEX.get(id) ?? 0 });
  }
  return entries.sort((a, b) => a.order - b.order || a.index - b.index).map((entry) => entry.hint);
}
