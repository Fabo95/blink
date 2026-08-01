/** Turn a browser keydown into a Tauri shortcut string, or null for a bare modifier. */
export function toShortcut(e: KeyboardEvent): string | null {
  const key = mainKey(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push('CommandOrControl');
  if (e.ctrlKey && !e.metaKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  return [...parts, key].join('+');
}

function mainKey(e: KeyboardEvent): string | null {
  const c = e.code;
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (/^F\d{1,2}$/.test(c)) return c;
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Minus: '-',
    Equal: '=',
    Slash: '/',
    Period: '.',
    Comma: ',',
  };
  return named[c] ?? null; // bare modifiers (ShiftLeft, MetaLeft, …) → null
}

/** Render a shortcut as macOS glyphs, e.g. `CommandOrControl+Shift+B` → `⌘⇧b`.
 *  Letters are lowercased — hints show the keys as pressed (the ⇧ glyph already
 *  says Shift), matching every other hint chip in the app. */
export function display(shortcut: string): string {
  const glyph: Record<string, string> = {
    CommandOrControl: '⌘',
    Command: '⌘',
    Super: '⌘',
    Meta: '⌘',
    Control: '⌃',
    Ctrl: '⌃',
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
  };
  return shortcut
    .split('+')
    .map((part) => glyph[part] ?? (part.length === 1 ? part.toLowerCase() : part))
    .join('');
}
