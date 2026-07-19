import { ShieldCheck, WandSparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureSource } from '@/generated/CaptureSource';
import { api, isTauri } from '@/lib/api';

/**
 * The floating quick-capture panel (a separate frameless window). The global
 * ⌘⇧B shortcut positions it by the cursor, shows it, and emits `capture-open`;
 * this reads the clipboard into a single field and saves it as the task on ⌘↵.
 */
export function QuickCapture() {
  const [text, setText] = useState('');
  const [redactions, setRedactions] = useState(0);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const draft = await api.captureFromClipboard();
    setText(draft.text);
    setRedactions(draft.redactionCount);
    setSource(draft.source);
    setError('');
    setTimeout(() => fieldRef.current?.focus(), 0);
  }, []);

  const hide = useCallback(async () => {
    setText('');
    setRedactions(0);
    setError('');
    await api.dismissCapture();
  }, []);

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !source) return;
    await api.saveTask({ text: trimmed, source });
    if (isTauri) {
      // Only the main (inbox) window cares — target it directly instead of
      // broadcasting to every window.
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'task-saved');
    }
    await hide();
  }, [text, source, hide]);

  const optimize = useCallback(async () => {
    if (!text.trim()) return;
    setOptimizing(true);
    setError('');
    try {
      setText(await api.optimizeText(text));
    } catch (e) {
      // Tauri rejects a command's Err with our AppError object `{ kind, message }`,
      // which isn't an Error instance — pull the message from whatever shape it is.
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : 'Optimization failed';
      setError(message);
    } finally {
      setOptimizing(false);
    }
  }, [text]);

  // Refresh whenever the shortcut re-opens the panel.
  useEffect(() => {
    void load();
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('capture-open', () => {
        void load();
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => unlisten?.();
  }, [load]);

  // Esc cancels, ⌘↵ / Ctrl↵ saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void hide();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hide, save]);

  return (
    <div className="flex h-screen w-screen">
      {/* Translucent tint over the native hudWindow vibrancy — the window itself
          supplies the frost, rounding (radius 16) and drop shadow. */}
      <div className="flex flex-1 flex-col gap-2.5 rounded-2xl border border-white/10 bg-[hsl(258_36%_13%/0.5)] p-4">
        {/* Drag handle: the header row moves the frameless window. */}
        <div
          data-tauri-drag-region=""
          className="flex select-none items-center justify-between [&>*]:pointer-events-none"
        >
          <span className="section-bar text-xs font-semibold uppercase tracking-wide text-primary">
            Quick capture
          </span>
          {redactions > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldCheck className="size-3" />
              {redactions} redacted
            </Badge>
          )}
        </div>

        {source && (source.appName || source.windowTitle) && (
          <p className="truncate text-[11px] text-muted-foreground">
            from {source.appName || source.appId}
            {source.windowTitle && ` · ${source.windowTitle}`}
          </p>
        )}

        <Textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Captured text…"
          className="flex-1 resize-none text-sm leading-relaxed"
        />

        {error && <p className="line-clamp-2 text-[11px] text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={optimize}
            disabled={optimizing || !text.trim()}
            className="text-blink-bright"
          >
            <WandSparkles className="size-3.5" />
            {optimizing ? 'Optimizing…' : 'Optimize with AI'}
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground">Esc · ⌘↵</span>
            <Button
              size="sm"
              onClick={save}
              disabled={!text.trim()}
              className="shadow-[0_6px_20px_-6px_hsl(258_90%_66%/0.55)]"
            >
              Save task
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
