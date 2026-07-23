import type { Shortcut } from '@/components/ShortcutHint';

// The shared list keymap, so every section surfaces the same keys in the same order.
// Inbox completes, Completed/Archive restore — only the ⏎ label differs.
const listShortcuts = (primary: Shortcut): Shortcut[] => [
  { keys: '↑↓', label: 'navigate' },
  primary,
  { keys: 'e', label: 'edit' },
  { keys: 'o', label: 'open' },
  { keys: '⌫', label: 'delete' },
];

// Inbox tasks can be reordered (⌥↑/⌥↓); Completed/Archive keep their natural order.
export const INBOX_SHORTCUTS: Shortcut[] = [
  ...listShortcuts({ keys: '⏎', label: 'complete' }),
  { keys: '⌥↑↓', label: 'reorder' },
];
export const COMPLETED_SHORTCUTS = listShortcuts({ keys: '⏎', label: 'restore' });
