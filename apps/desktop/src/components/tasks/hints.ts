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

export const INBOX_SHORTCUTS = listShortcuts({ keys: '⏎', label: 'complete' });
export const COMPLETED_SHORTCUTS = listShortcuts({ keys: '⏎', label: 'restore' });
