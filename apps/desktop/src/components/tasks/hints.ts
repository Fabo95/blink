import type { Shortcut } from '@/components/ShortcutHint';

export interface StatuslineContext {
  /** False while an overlay (editor, dialog, prompt) owns the keyboard. */
  interactive: boolean;
  hasRows: boolean;
  /** The cursor's task, or null when nothing is focused. */
  focused: { done: boolean; hasLink: boolean; reorderable: boolean } | null;
  archive: { open: boolean; paged: boolean };
  hasGroups: boolean;
}

// The one builder for the footer statusline — a chip appears only while its key does
// something, in the shared grammar order: navigate · primary · actions · context · Esc.
export function statuslineShortcuts(ctx: StatuslineContext): Shortcut[] {
  if (!ctx.interactive) return [];
  const { focused } = ctx;
  return [
    ...(ctx.hasRows ? [{ keys: '↑↓', vim: 'jk', label: 'navigate' }] : []),
    ...(focused
      ? [
          { keys: '↵', label: focused.done ? 'restore' : 'complete' },
          { keys: 'e', vim: 'i', label: 'edit' },
          ...(focused.hasLink ? [{ keys: 'o', label: 'open' }] : []),
          { keys: '⌫', vim: 'd', label: 'delete' },
          ...(focused.reorderable ? [{ keys: '⌥↑↓', vim: '⌥kj', label: 'reorder' }] : []),
        ]
      : []),
    ...(ctx.archive.open
      ? [
          { keys: '/', label: 'search' },
          ...(ctx.archive.paged ? [{ keys: '←→', vim: 'hl', label: 'page' }] : []),
        ]
      : ctx.hasGroups
        ? [{ keys: '←→', vim: 'hl', label: 'filter' }]
        : []),
    // Esc (unselect) ends the row, matching the actions-then-cancel order of the overlay rows.
    ...(focused ? [{ keys: 'Esc', label: 'unselect' }] : []),
  ];
}
