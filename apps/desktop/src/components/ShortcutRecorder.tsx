import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { api, type CaptureMethod } from '@/lib/api';
import { display, toShortcut } from '@/lib/shortcut';
import { cn } from '@/lib/utils';

interface ShortcutRecorderProps {
  method: CaptureMethod;
  value: string;
  onChange: (shortcut: string) => void;
}

/** A compact button showing a method's hotkey; click it, then press a combo to change it. */
export function ShortcutRecorder({ method, value, onChange }: ShortcutRecorderProps) {
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
        await api.setCaptureShortcut(method, recorded);
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
  }, [recording, stop, onChange, method]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setError('');
        setRecording(true);
      }}
      title={error || 'Click, then press a key combo to change the capture shortcut'}
      className="min-w-16 text-muted-foreground"
    >
      {recording ? (
        <span className="text-[11px]">Press keys…</span>
      ) : value ? (
        <Kbd className={cn(error && 'border-destructive/50 text-destructive')}>
          {display(value)}
        </Kbd>
      ) : (
        <span className="text-[11px]">—</span>
      )}
    </Button>
  );
}
