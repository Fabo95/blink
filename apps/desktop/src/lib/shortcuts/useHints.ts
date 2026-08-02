import { useSyncExternalStore } from 'react';
import type { Hint } from '@/components/HintRow';
import { useShortcutContext } from './ShortcutProvider';
import { SHORTCUT_IDS, SHORTCUTS, type Shortcut } from './shortcuts';

/**
 * The statusline chips for right now. Each shortcut has a specificity `level` (higher =
 * more specific — 0 navigate, 1 browse, 2 task, 3 overlay). The bar shows the highest
 * active level plus base navigation (level 0), so it always reflects the most specific
 * thing you can do and stays one short row. (Navigation is only enabled outside overlays,
 * so it naturally drops away when one is open.)
 */
export function useHints(): Hint[] {
  const { subscribeToShortcutOptions, getShortcutOptions } = useShortcutContext();
  const options = useSyncExternalStore(subscribeToShortcutOptions, getShortcutOptions);

  // Every enabled shortcut that has a chip, in SHORTCUTS declaration order.
  const enabledShortcuts = SHORTCUT_IDS.flatMap((id) => {
    const shortcut: Shortcut = SHORTCUTS[id];
    if (!options.get(id)?.enabled || !shortcut.hint || shortcut.level === undefined) return [];
    return [{ hint: shortcut.hint, level: shortcut.level, order: shortcut.order }];
  });

  const visibleShortcutLevel = Math.max(0, ...enabledShortcuts.map((c) => c.level));
  return enabledShortcuts
    .filter((c) => c.level === visibleShortcutLevel || c.level === 0) // top level + base navigation
    .sort((a, b) => a.order - b.order) // stable sort → declaration order breaks `order` ties
    .map((c) => c.hint);
}
