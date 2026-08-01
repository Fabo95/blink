import type { Hint } from '@/components/HintRow';

/** Statusline slots — every shortcut picks one, so every row keeps the shared grammar
 *  (navigate · primary · actions · context · Esc). Ties keep SHORTCUTS declaration order. */
export const ORDER = {
  navigate: 10,
  primary: 20,
  action: 30,
  context: 50,
  esc: 90,
} as const;

export interface Shortcut {
  keys: string;
  hint: Hint | null;
  order: number;
  opts?: { enableOnFormTags?: boolean; preventDefault?: boolean };
}

/**
 * Every chip in the app, keyed by the binding it belongs to — one hint per physical key,
 * so the chip for a key reads the same everywhere it appears. Labels are the app-wide
 * verbs (⌘↵ confirms, Esc cancels, ←→ switches); the dev check below fails fast if a
 * SHORTCUTS entry diverges.
 */
const HINTS = {
  'down, j': { keys: '↑↓', vim: 'jk', label: 'navigate' },
  'tab, shift+tab': { keys: '⇥', label: 'field' },
  enter: { keys: '↵', label: 'toggle' },
  'mod+enter': { keys: '⌘↵', label: 'confirm' },
  'e, i': { keys: 'e', vim: 'i', label: 'edit' },
  'mod+i': { keys: '⌘i', label: 'improve' },
  o: { keys: 'o', label: 'open' },
  'mod+g': { keys: '⌘g', label: 'group' },
  'backspace, delete, d': { keys: '⌫', vim: 'd', label: 'delete' },
  'alt+up, alt+k': { keys: '⌥↑↓', vim: '⌥kj', label: 'reorder' },
  '/': { keys: '/', label: 'search' },
  'left, h': { keys: '←→', vim: 'hl', label: 'switch' },
  escape: { keys: 'Esc', label: 'cancel' },
  'mod+r': { keys: '⌘r', label: 'resend' },
  'mod+n': { keys: '⌘n', label: 'switch' },
  'mod+f': { keys: '⌘f', label: 'forgot' },
} satisfies Record<string, Hint>;

/**
 * Every shortcut in the app, in one table — the single place keys are assigned, so
 * conflicts are visible at a glance. Components contribute only enablement and the
 * handler via `useShortcut(id, { enabled, callback })`; nothing else may bind a key.
 *
 * Entries sharing keys (Esc, ⌘↵, ←→/hl) rely on mutually exclusive `enabled` conditions:
 * only one of them is enabled at a time (e.g. the editor's Esc while the editor is open,
 * the cursor's Esc otherwise).
 */
export const SHORTCUTS = {
  // ── browsing the inbox (main window) ──────────────────────────────────────────────
  'cursor.down': { keys: 'down, j', hint: HINTS['down, j'], order: ORDER.navigate },
  'cursor.up': { keys: 'up, k', hint: null, order: ORDER.navigate },
  'cursor.unselect': { keys: 'escape', hint: HINTS.escape, order: ORDER.esc },
  'task.toggle': { keys: 'enter', hint: HINTS.enter, order: ORDER.primary },
  'task.edit': { keys: 'e, i', hint: HINTS['e, i'], order: ORDER.action },
  'task.open': { keys: 'o', hint: HINTS.o, order: ORDER.action + 1 },
  'task.delete': {
    keys: 'backspace, delete, d',
    hint: HINTS['backspace, delete, d'],
    order: ORDER.action + 2,
  },
  'task.moveUp': {
    keys: 'alt+up, alt+k',
    hint: HINTS['alt+up, alt+k'],
    order: ORDER.action + 3,
  },
  'task.moveDown': { keys: 'alt+down, alt+j', hint: null, order: ORDER.action + 3 },
  // ←→/hl pair with archive paging below: filter cycles only while the archive is closed.
  'filter.prev': { keys: 'left, h', hint: HINTS['left, h'], order: ORDER.context },
  'filter.next': { keys: 'right, l', hint: null, order: ORDER.context },
  'group.new': { keys: 'n', hint: null, order: ORDER.context },
  'group.rename': { keys: 'r', hint: null, order: ORDER.context },
  'group.delete': { keys: 'mod+backspace', hint: null, order: ORDER.context },
  'section.inbox': { keys: 'b', hint: null, order: ORDER.context },
  'section.completed': { keys: 'c', hint: null, order: ORDER.context },
  'archive.toggle': { keys: 'a', hint: null, order: ORDER.context },
  'archive.search': { keys: '/', hint: HINTS['/'], order: ORDER.context },
  'archive.prevPage': { keys: 'left, h', hint: HINTS['left, h'], order: ORDER.context + 1 },
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
    hint: HINTS['tab, shift+tab'],
    order: ORDER.navigate,
    opts: { enableOnFormTags: true, preventDefault: false },
  },
  'editor.save': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'editor.improve': {
    keys: 'mod+i',
    hint: HINTS['mod+i'],
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'editor.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },
  'taskDelete.confirm': { keys: 'mod+enter', hint: HINTS['mod+enter'], order: ORDER.primary },
  'taskDelete.cancel': { keys: 'escape', hint: HINTS.escape, order: ORDER.esc },
  'groupDelete.confirm': { keys: 'mod+enter', hint: HINTS['mod+enter'], order: ORDER.primary },
  'groupDelete.cancel': { keys: 'escape', hint: HINTS.escape, order: ORDER.esc },
  'groupPrompt.submit': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'groupPrompt.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },

  // ── capture: the capture panel windows ────────────────────────────────────────────
  'capture.save': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'capture.improve': {
    keys: 'mod+i',
    hint: HINTS['mod+i'],
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'capture.group': {
    keys: 'mod+g',
    hint: HINTS['mod+g'],
    order: ORDER.action + 1,
    opts: { enableOnFormTags: true },
  },
  'capture.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },

  // ── auth: the login screens (keyboard-only; hints show in the LoginScreen statusline) ─
  'auth.submit': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    order: ORDER.primary,
    opts: { enableOnFormTags: true },
  },
  'auth.back': {
    keys: 'escape',
    hint: HINTS.escape,
    order: ORDER.esc,
    opts: { enableOnFormTags: true },
  },
  'auth.resend': {
    keys: 'mod+r',
    hint: HINTS['mod+r'],
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'auth.toggleMode': {
    keys: 'mod+n',
    hint: HINTS['mod+n'],
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },
  'auth.forgot': {
    keys: 'mod+f',
    hint: HINTS['mod+f'],
    order: ORDER.action,
    opts: { enableOnFormTags: true },
  },

  // ── always on ─────────────────────────────────────────────────────────────────────
  'app.hintDialect': { keys: 'v', hint: null, order: ORDER.context },
  'app.signOut': { keys: 'mod+shift+q', hint: null, order: ORDER.context },
} satisfies Record<string, Shortcut>;

// Same keys ⇒ same hint: the statusline may never show two different chips for one
// physical shortcut. Referencing HINTS satisfies this; the identity comparison keeps
// that pattern honest.
if (import.meta.env.DEV) {
  const hintByKeys = new Map<string, Hint>();
  for (const def of Object.values(SHORTCUTS)) {
    if (!def.hint) continue;
    const existing = hintByKeys.get(def.keys);
    if (existing === undefined) hintByKeys.set(def.keys, def.hint);
    else if (existing !== def.hint) {
      throw new Error(`SHORTCUTS: entries for '${def.keys}' use different hints`);
    }
  }
}

export type ShortcutId = keyof typeof SHORTCUTS;

export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[];
