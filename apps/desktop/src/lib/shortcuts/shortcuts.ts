import type { Hint } from '@/components/HintRow';

export interface Shortcut {
  keys: string;
  hint: Hint | null;
  /** Statusline specificity — higher wins, like a z-index. The bar shows the highest
   *  active level, so it reflects the most specific thing you can do:
   *  `0` navigate (base list) · `1` browse (sections/groups) · `2` task (focused row) ·
   *  `3` overlay (editor / dialog / prompt). Omit for keys with no statusline chip. */
  level?: number;
  /** Full description for the `?` cheat-sheet (the chip's terse label isn't enough). */
  describe?: string;
  /** Sort slot within a level's row — the shared grammar, gaps left for siblings:
   *  `10` navigate · `20` primary · `30` actions · `50` context · `90` Esc. Ties keep
   *  SHORTCUTS declaration order. */
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
  p: { keys: 'p', label: 'prompt' },
  'mod+g': { keys: '⌘g', label: 'group' },
  'backspace, delete, d': { keys: '⌫', vim: 'd', label: 'delete' },
  'mod+backspace, mod+delete': { keys: '⌘⌫', label: 'remove' },
  'alt+up, alt+k': { keys: '⌥↑↓', vim: '⌥kj', label: 'reorder' },
  s: { keys: 's', label: 'search' },
  'left, h': { keys: '←→', vim: 'hl', label: 'switch' },
  escape: { keys: 'Esc', label: 'cancel' },
  'mod+r': { keys: '⌘r', label: 'resend' },
  'mod+n': { keys: '⌘n', label: 'switch' },
  'mod+f': { keys: '⌘f', label: 'forgot' },
  'mod+shift+o': { keys: '⌘⇧o', label: 'sign out' },
  a: { keys: 'a', label: 'archive' },
  n: { keys: 'n', label: 'new' },
  r: { keys: 'r', label: 'edit' },
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
  // ── task: the focused row ───────────────────────────────────────────────────────────
  'cursor.down': {
    keys: 'down, j',
    hint: HINTS['down, j'],
    level: 0,
    describe: 'Move between tasks',
    order: 10,
  },
  'cursor.up': { keys: 'up, k', hint: null, level: 0, order: 10 },
  'task.toggle': {
    keys: 'enter',
    hint: HINTS.enter,
    level: 2,
    describe: 'Complete or restore the task',
    order: 20,
  },
  'task.edit': {
    keys: 'e, i',
    hint: HINTS['e, i'],
    level: 2,
    describe: 'Edit the task',
    order: 30,
  },
  'task.open': {
    keys: 'o',
    hint: HINTS.o,
    level: 2,
    describe: 'Open the task’s link',
    order: 31,
  },
  'task.prompt': {
    keys: 'p',
    hint: HINTS.p,
    level: 2,
    describe: 'Copy an AI prompt for the task',
    order: 31,
  },
  'task.delete': {
    keys: 'backspace, delete, d',
    hint: HINTS['backspace, delete, d'],
    level: 2,
    describe: 'Delete the task',
    order: 32,
  },
  'task.moveUp': {
    keys: 'alt+up, alt+k',
    hint: HINTS['alt+up, alt+k'],
    level: 2,
    describe: 'Reorder the task (Inbox only)',
    order: 33,
  },
  'task.moveDown': {
    keys: 'alt+down, alt+j',
    hint: null,
    level: 2,
    order: 33,
  },
  'cursor.unselect': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 2,
    describe: 'Clear the selection',
    order: 90,
  },

  // ── browse: archive, groups (shown when nothing is focused) ─────────────────────────
  'archive.toggle': {
    keys: 'a',
    hint: HINTS.a,
    level: 1,
    describe: 'Open or leave the Archive',
    order: 52,
  },
  // Second way out of the archive page: Esc when no row is focused (a focused row's Esc
  // clears the selection first). Same key as every other Esc — mutually exclusive by state.
  'archive.close': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 1,
    describe: 'Leave the Archive',
    order: 90,
  },
  'group.new': {
    keys: 'n',
    hint: HINTS.n,
    level: 1,
    describe: 'Create a task group',
    order: 53,
  },
  'group.rename': {
    keys: 'r',
    hint: HINTS.r,
    level: 1,
    describe: 'Edit the current group (name + context)',
    order: 54,
  },
  // Same key as task delete — disambiguated by focus: a focused task deletes the task, no
  // focus (browsing) + a selected group deletes the group. Enabled in TaskList (needs the
  // cursor's focus to stay mutually exclusive with `task.delete`).
  'group.delete': {
    keys: 'backspace, delete, d',
    hint: HINTS['backspace, delete, d'],
    level: 1,
    describe: 'Delete the current group',
    order: 55,
  },
  // ←→/hl is horizontal navigation (level 0, like ↑↓) — shown at every list level, not
  // just browsing. Filter cycling and archive paging share the key, mutually exclusive:
  // filter while the archive is closed, paging while it's open.
  'filter.prev': {
    keys: 'left, h',
    hint: HINTS['left, h'],
    level: 0,
    describe: 'Switch between groups',
    order: 15,
  },
  'filter.next': { keys: 'right, l', hint: null, level: 0, order: 15 },
  'archive.search': {
    keys: 's',
    hint: HINTS.s,
    level: 1,
    describe: 'Search completed tasks',
    order: 57,
  },
  'archive.prevPage': {
    keys: 'left, h',
    hint: HINTS['left, h'],
    level: 0,
    describe: 'Page through completed tasks',
    order: 15,
  },
  'archive.nextPage': {
    keys: 'right, l',
    hint: null,
    level: 0,
    order: 15,
  },
  // The list is cursor-driven, not focus-driven — swallow Tab while browsing.
  'browse.swallowTab': {
    keys: 'tab, shift+tab',
    hint: null,
    order: 50,
    opts: { enableOnFormTags: true },
  },

  // ── overlays: the editor popover, delete confirms, group prompt ─────────────────────
  'editor.field': {
    keys: 'tab, shift+tab',
    hint: HINTS['tab, shift+tab'],
    level: 3,
    describe: 'Move between fields',
    order: 10,
    opts: { enableOnFormTags: true, preventDefault: false },
  },
  'editor.save': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    describe: 'Save your changes',
    order: 20,
    opts: { enableOnFormTags: true },
  },
  'editor.improve': {
    keys: 'mod+i',
    hint: HINTS['mod+i'],
    level: 3,
    describe: 'Rewrite the text with AI',
    order: 30,
    opts: { enableOnFormTags: true },
  },
  'editor.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 3,
    describe: 'Discard and close',
    order: 90,
    opts: { enableOnFormTags: true },
  },
  'taskDelete.confirm': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    order: 20,
  },
  'taskDelete.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 3,
    order: 90,
  },
  'groupDelete.confirm': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    order: 20,
  },
  'groupDelete.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 3,
    order: 90,
  },
  // Only the edit prompt has two fields (name + context) to move between; ⇥ wraps within
  // the popover, mirroring the task editor's `editor.field`.
  'groupPrompt.field': {
    keys: 'tab, shift+tab',
    hint: HINTS['tab, shift+tab'],
    level: 3,
    order: 10,
    opts: { enableOnFormTags: true, preventDefault: false },
  },
  'groupPrompt.submit': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    order: 20,
    opts: { enableOnFormTags: true },
  },
  'groupPrompt.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 3,
    order: 90,
    opts: { enableOnFormTags: true },
  },

  // ── capture: the capture panel windows (own window → own bar) ───────────────────────
  'capture.save': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    order: 20,
    opts: { enableOnFormTags: true },
  },
  'capture.improve': {
    keys: 'mod+i',
    hint: HINTS['mod+i'],
    level: 3,
    order: 30,
    opts: { enableOnFormTags: true },
  },
  'capture.group': {
    keys: 'mod+g',
    hint: HINTS['mod+g'],
    level: 3,
    order: 31,
    opts: { enableOnFormTags: true },
  },
  'capture.cancel': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 3,
    order: 90,
    opts: { enableOnFormTags: true },
  },

  // ── AI settings: the key field in the inbox's AI card (enabled while it's focused) ──
  'ai.saveKey': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    describe: 'Test the API key and save it',
    order: 20,
    opts: { enableOnFormTags: true },
  },
  'ai.clearKey': {
    keys: 'mod+backspace, mod+delete',
    hint: HINTS['mod+backspace, mod+delete'],
    level: 3,
    describe: 'Remove the stored API key',
    order: 30,
    opts: { enableOnFormTags: true },
  },

  // ── auth: the login screens (own screen → own bar) ──────────────────────────────────
  'auth.submit': {
    keys: 'mod+enter',
    hint: HINTS['mod+enter'],
    level: 3,
    order: 20,
    opts: { enableOnFormTags: true },
  },
  'auth.back': {
    keys: 'escape',
    hint: HINTS.escape,
    level: 3,
    order: 90,
    opts: { enableOnFormTags: true },
  },
  'auth.resend': {
    keys: 'mod+r',
    hint: HINTS['mod+r'],
    level: 3,
    order: 30,
    opts: { enableOnFormTags: true },
  },
  'auth.toggleMode': {
    keys: 'mod+n',
    hint: HINTS['mod+n'],
    level: 3,
    order: 30,
    opts: { enableOnFormTags: true },
  },
  'auth.forgot': {
    keys: 'mod+f',
    hint: HINTS['mod+f'],
    level: 3,
    order: 30,
    opts: { enableOnFormTags: true },
  },

  // ── always on ───────────────────────────────────────────────────────────────────────
  // help + dialect toggle have their own footer affordances (no statusline chip).
  'app.help': { keys: 'c', hint: null, order: 50 },
  'app.hintDialect': { keys: 'v', hint: null, order: 50 },
  // Sign-out is a base-level (0) statusline chip so it shows wherever it's enabled — the
  // inbox footer and, crucially, the vault gate (which has no header to hang it off).
  'app.signOut': {
    keys: 'mod+shift+o',
    hint: HINTS['mod+shift+o'],
    level: 0,
    order: 50,
    describe: 'Sign out of your account',
  },
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

/** The `?` cheat-sheet, grouped by the three shortcut types the user thinks in. Each id's
 *  chip comes from its `hint`, its explanation from `describe` — one source of truth. */
export const CHEATSHEET: { title: string; ids: ShortcutId[] }[] = [
  { title: 'Task groups', ids: ['group.new', 'group.rename', 'group.delete', 'filter.prev'] },
  {
    title: 'Archive',
    ids: ['archive.toggle', 'archive.search', 'archive.prevPage', 'archive.close'],
  },
  {
    title: 'Tasks',
    ids: [
      'cursor.down',
      'task.toggle',
      'task.edit',
      'task.open',
      'task.prompt',
      'task.delete',
      'task.moveUp',
      'cursor.unselect',
    ],
  },
  {
    title: 'Editing a task',
    ids: ['editor.field', 'editor.improve', 'editor.save', 'editor.cancel'],
  },
];
