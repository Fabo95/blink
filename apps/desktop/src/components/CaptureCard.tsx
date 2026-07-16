import { LocalOnnxTitleGenerator } from '@blink/ai';
import type { CaptureDraft, NewTask } from '@blink/core';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const titleEngine = new LocalOnnxTitleGenerator();

interface CaptureCardProps {
  onSaved: () => void;
}

export function CaptureCard({ onSaved }: CaptureCardProps) {
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFromClipboard = useCallback(async () => {
    setBusy(true);
    try {
      const captured = await api.captureFromClipboard();
      setDraft(captured);
      setBody(captured.text);
      const suggestion = await titleEngine.suggest(captured);
      setTitle(suggestion.title);
    } finally {
      setBusy(false);
    }
  }, []);

  // Keep the redaction count live as the user edits the body.
  const [redactions, setRedactions] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!body) {
      setRedactions(0);
      return;
    }
    api.sanitize(body).then((result) => {
      if (!cancelled) setRedactions(result.redactionCount);
    });
    return () => {
      cancelled = true;
    };
  }, [body]);

  const save = useCallback(async () => {
    if (!draft || !title.trim()) return;
    setBusy(true);
    try {
      const task: NewTask = { title: title.trim(), body, source: draft.source };
      await api.saveTask(task);
      setDraft(null);
      setTitle('');
      setBody('');
      onSaved();
    } finally {
      setBusy(false);
    }
  }, [draft, title, body, onSaved]);

  return (
    <section className="rounded-xl border border-blink-border bg-blink-surface p-5 shadow-glow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-bar text-sm font-semibold uppercase tracking-wide text-blink-bright">
          Capture
        </h2>
        <button
          type="button"
          onClick={loadFromClipboard}
          disabled={busy}
          className="rounded-md border border-blink-primary/40 bg-blink-primary/10 px-3 py-1.5 text-xs font-medium text-blink-soft transition hover:bg-blink-primary/20 disabled:opacity-50"
        >
          ⌘⇧B · Read clipboard
        </button>
      </div>

      {!draft ? (
        <p className="text-sm text-blink-muted">
          Mark text anywhere, hit the global shortcut, and Blink sanitizes it locally before it ever
          becomes a task. Nothing leaves this machine.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-blink-muted">
            <Badge>{draft.source.appId}</Badge>
            <Badge>{draft.source.windowTitle}</Badge>
            {redactions > 0 && <Badge tone="danger">{redactions} secret(s) redacted locally</Badge>}
          </div>

          <label className="block text-xs text-blink-muted">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-blink-border bg-blink-bg px-3 py-2 text-sm text-blink-text outline-none focus:border-blink-primary"
            />
          </label>

          <label className="block text-xs text-blink-muted">
            Body (sanitized)
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1 w-full resize-y rounded-md border border-blink-border bg-blink-bg px-3 py-2 font-mono text-xs text-blink-code outline-none focus:border-blink-primary"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md px-3 py-1.5 text-xs text-blink-muted hover:text-blink-text"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !title.trim()}
              className="rounded-md bg-blink-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-blink-bright disabled:opacity-50"
            >
              Save task
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 ${
        tone === 'danger'
          ? 'border-blink-danger/40 bg-blink-danger/10 text-blink-danger'
          : 'border-blink-border bg-blink-elevated text-blink-muted'
      }`}
    >
      {children}
    </span>
  );
}
