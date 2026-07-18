import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureSource } from '@/generated/CaptureSource';
import { api, isTauri } from '@/lib/api';

/**
 * The floating quick-capture panel (a separate frameless window). The global
 * ⌘⇧B shortcut positions it by the cursor, shows it, and emits `capture-open`;
 * this reads the clipboard, splits it into title/body, and saves on ⌘↵.
 */
export function QuickCapture() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [redactions, setRedactions] = useState(0);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const draft = await api.captureFromClipboard();
    const nl = draft.text.indexOf('\n');
    if (nl === -1) {
      setTitle(draft.text.trim());
      setBody('');
    } else {
      setTitle(draft.text.slice(0, nl).trim());
      setBody(draft.text.slice(nl + 1).trim());
    }
    setRedactions(draft.redactionCount);
    setSource(draft.source);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, []);

  const hide = useCallback(async () => {
    setTitle('');
    setBody('');
    setRedactions(0);
    await api.dismissCapture();
  }, []);

  const save = useCallback(async () => {
    if (!title.trim() || !source) return;
    await api.saveTask({ title: title.trim(), body, source });
    if (isTauri) {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('task-saved');
    }
    await hide();
  }, [title, body, source, hide]);

  // Refresh the draft whenever the shortcut re-opens the panel.
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
    <div className="flex h-screen w-screen p-3">
      <div className="flex flex-1 flex-col gap-2.5 rounded-xl border border-white/10 bg-card p-4 shadow-2xl">
        <div className="flex items-center justify-between">
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

        <Input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="font-medium"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body"
          className="flex-1 resize-none font-mono text-xs text-blink-code"
        />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Esc to cancel · ⌘↵ to save</span>
          <Button
            size="sm"
            onClick={save}
            disabled={!title.trim()}
            className="shadow-[0_6px_20px_-6px_hsl(258_90%_66%/0.55)]"
          >
            Save task
          </Button>
        </div>
      </div>
    </div>
  );
}
