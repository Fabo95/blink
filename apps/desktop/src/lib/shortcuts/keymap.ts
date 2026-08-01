import type { Hint } from '@/components/HintRow';

/** Statusline slots — every shortcut picks one, so every row keeps the shared grammar
 *  (navigate · primary · actions · context · Esc). Ties keep KEYMAP declaration order. */
export const ORDER = {
  navigate: 10,
  primary: 20,
  action: 30,
  context: 50,
  esc: 90,
} as const;

export interface ShortcutDef {
  /** The react-hotkeys binding; synonyms comma-separated (`'e, i'`). */
  keys: string;
  /** Statusline chip. `null` = the key is surfaced by a control-local chip instead
   *  (section headers, filter bar, menu items, clickable `AuthAction`s) or it is the
   *  silent half of a pair. Dynamic labels are overridden at the use site. */
  hint: Hint | null;
  order: number;
  opts?: { enableOnFormTags?: boolean; preventDefault?: boolean };
}

/**
 * Every shortcut in the app, in one table — the single place keys are assigned, so
 * conflicts are visible at a glance. Components contribute only enablement and the
 * handler via `useShortcut(id, { enabled, callback })`; nothing else may bind a key.
 *
 * Entries sharing keys (Esc, ⌘↵, ←→/hl) rely on mutually exclusive `enabled` conditions:
 * only one of them is enabled at a time (e.g. the editor's Esc while the editor is open,
 * the cursor's Esc otherwise).
 */
export const KEYMAP = {
  // ── browsing the inbox (main window) ──────────────────────────────────────────────
  'cursor.down': {
    keys: 'down, j',
    hint: { keys: '↑↓', vim: 'jk', label: 'navigate' },
    order: ORDER.navigate,
  },
  'cursor.up': { keys: 'up, k', hint: null, order: ORDER.navigate },
  'cursor.unselect': {
    keys: 'escape',
    hint: { keys: 'Esc', label: 'unselect' },
    order: ORDER.esc,
  },
  // Label (complete/restore) follows the focused row — overridden at the use site.
  'task.toggle': {
    keys: 'enter',
    hint: { keys: '↵', label: 'complete' },
    order: ORDER.primary,
  },
  'task.edit': {
    keys: 'e, i',
    hint: { keys: 'e', vim: 'i', label: 'edit' },
    order: ORDER.action,
  },
  'task.open': {
    keys: 'o',
    hint: { keys: 'o', label: 'open' },
    order: ORDER.action + 1,
  },
  'task.delete': {
    keys: 'backspace, delete, d',
    hint: { keys: '⌫', vim: 'd', label: 'delete' },
    order: ORDER.action + 2,
  },
  'task.moveUp': {
    keys: 'alt+up, alt+k',
    hint: { keys: '⌥↑↓', vim: '⌥kj', label: 'reorder' },
    order: ORDER.action + 3,
  },
  'task.moveDown': {
    keys: 'alt+down, alt+j',
    hint: null,
    order: ORDER.action + 3,
  },
  // ←→/hl pair with archive paging below: filter cycles only while the archive is closed.
  'filter.prev': {
    keys: 'left, h',
    hint: { keys: '←→', vim: 'hl', label: 'filter' },
    order: ORDER.context,
  },
  'filter.next': { keys: 'right, l', hint: null, order: ORDER.context },
  'group.new': { keys: 'n', hint: null, order: ORDER.context },
  'group.rename': { keys: 'r', hint: null, order: ORDER.context },
  'group.delete': { keys: 'mod+backspace', hint: null, order: ORDER.context },
  'section.inbox': { keys: 'b', hint: null, order: ORDER.context },
  'section.completed': { keys: 'c', hint: null, order: ORDER.context },
  'archive.toggle': { keys: 'a', hint: null, order: ORDER.context },
  'archive.search': {
    keys: '/',
    hint: { keys: '/', label: 'search' },
    order: ORDER.context,
  },
  'archive.prevPage': {
    keys: 'left, h',
    hint: { keys: '←→', vim: 'hl', label: 'page' },
    order: ORDER.context + 1,
  },
  'archive.nextPage': { keys: 'right, l', hint: null, order: ORDER.context + 1 },
  // The list is cursor-driven, not focus-driven — swallow Tab while browsing.
  'browse.swallowTab': {
    keys: 'tab, shift+tab',
    hint: null,
    order: ORDER.context,
    opts: { enableOnFormTags: true },
  },

  // ── overlays: enabled while open (editor popover, dialogs, group prompt) ──────────
  'editor.field': {
    keys: 'tab, shift+tab',
    hint: { keys: '⇥', label: 'field' },
    order: ORDER.navigate,
    opts: { enableOnFormTags: true, preventDefault: false },
  },
  'editor.save': {
    keys: 'mod+enter',
    hint: { keys: '⌘↵', label: 'save' },
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'editor.improve': {
    keys: 'mod+i',
    hint: { keys: '⌘i', label: 'improve' },
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'editor.cancel': {
    keys: 'escape',
    hint: { keys: 'Esc', label: 'cancel' },
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },
  'taskDelete.confirm': {
    keys: 'mod+enter',
    hint: { keys: '⌘↵', label: 'delete' },
    order: ORDER.primary,
  },
  'taskDelete.cancel': {
    keys: 'escape',
    hint: { keys: 'Esc', label: 'cancel' },
    order: ORDER.esc,
  },
  'groupDelete.confirm': {
    keys: 'mod+enter',
    hint: { keys: '⌘↵', label: 'delete group' },
    order: ORDER.primary,
  },
  'groupDelete.cancel': {
    keys: 'escape',
    hint: { keys: 'Esc', label: 'cancel' },
    order: ORDER.esc,
  },
  // Label (create/rename group) follows the prompt mode — overridden at the use site.
  'groupPrompt.submit': {
    keys: 'mod+enter',
    hint: { keys: '⌘↵', label: 'create group' },
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'groupPrompt.cancel': {
    keys: 'escape',
    hint: { keys: 'Esc', label: 'cancel' },
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },

  // ── capture: the capture panel windows ────────────────────────────────────────────
  'capture.save': {
    keys: 'mod+enter',
    hint: { keys: '⌘↵', label: 'save' },
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'capture.improve': {
    keys: 'mod+i',
    hint: { keys: '⌘i', label: 'improve' },
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'capture.group': {
    keys: 'mod+g',
    hint: { keys: '⌘g', label: 'group' },
    order: ORDER.action + 1,
    opts: { enableOnFormTags: true },
  },
  'capture.cancel': {
    keys: 'escape',
    hint: { keys: 'Esc', label: 'cancel' },
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },

  // ── auth: the login screens (chips render clickable in AuthAction, hence hint: null) ─
  // Label follows the form's verb — overridden at the use site.
  'auth.submit': {
    keys: 'mod+enter',
    hint: { keys: '⌘↵', label: 'submit' },
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'auth.back': {
    keys: 'escape',
    hint: null,
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },
  'auth.resend': {
    keys: 'mod+r',
    hint: null,
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'auth.toggleMode': {
    keys: 'mod+n',
    hint: null,
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'auth.forgot': {
    keys: 'mod+f',
    hint: null,
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },

  // ── always on ─────────────────────────────────────────────────────────────────────
  'app.hintDialect': { keys: 'v', hint: null, order: ORDER.context },
  'app.signOut': { keys: 'mod+shift+q', hint: null, order: ORDER.context },
} satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof KEYMAP;

export const SHORTCUT_IDS = Object.keys(KEYMAP) as ShortcutId[];
