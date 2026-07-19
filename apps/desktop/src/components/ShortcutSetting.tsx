import { Keyboard } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

/** Turn a browser keydown into a Tauri shortcut string, or null for a bare modifier. */
function toShortcut(e: KeyboardEvent): string | null {
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

/** Render a shortcut as macOS glyphs, e.g. `CommandOrControl+Shift+B` → `⌘⇧B`. */
function display(shortcut: string): string {
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
    .map((part) => glyph[part] ?? part)
    .join('');
}

export function ShortcutSetting() {
  const [shortcut, setShortcut] = useState('');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCaptureShortcut().then(setShortcut).catch(() => {});
  }, []);

  const stop = useCallback(() => setRecording(false), []);

  useEffect(() => {
    if (!recording) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return stop();
      const recorded = toShortcut(e);
      if (!recorded) return; // still waiting for a non-modifier key
      stop();
      try {
        await api.setCaptureShortcut(recorded);
        setShortcut(recorded);
        setError('');
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Could not set shortcut';
        setError(message);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, stop]);

  return (
    <Card className="panel">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Keyboard className="size-3.5 text-muted-foreground" />
              Capture shortcut
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Global hotkey to open quick capture from any app.
            </p>
            {error && <p className="mt-1 line-clamp-1 text-[11px] text-destructive">{error}</p>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError('');
              setRecording(true);
            }}
            className="min-w-24 shrink-0 font-mono"
          >
            {recording ? 'Press keys…' : display(shortcut) || '—'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
