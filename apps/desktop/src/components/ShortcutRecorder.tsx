import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { display, toShortcut } from '@/lib/shortcut';
import { cn } from '@/lib/utils';

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
}

/** A compact button showing the capture hotkey; click it, then press a combo to change it. */
export function ShortcutRecorder({ value, onChange }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

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
        onChange(recorded);
        setError('');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Could not set shortcut',
        );
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, stop, onChange]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setError('');
        setRecording(true);
      }}
      title={error || 'Click, then press a key combo to change the capture shortcut'}
      className={cn('min-w-16 font-mono text-muted-foreground', error && 'text-destructive')}
    >
      {recording ? 'Press keys…' : display(value) || '—'}
    </Button>
  );
}
