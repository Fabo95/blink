import { suggestTitle } from '@blink/ai/suggest-title';
import { ClipboardPaste, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { NewTask } from '@/generated/NewTask';
import { api } from '@/lib/api';

interface CaptureCardProps {
  onSaved: () => void;
}

export function CaptureCard({ onSaved }: CaptureCardProps) {
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [redactions, setRedactions] = useState(0);

  const loadFromClipboard = useCallback(async () => {
    setBusy(true);
    try {
      const captured = await api.captureFromClipboard();
      setDraft(captured);
      setBody(captured.text);
      setTitle(suggestTitle(captured).title);
    } finally {
      setBusy(false);
    }
  }, []);

  // Keep the redaction count live as the user edits the body.
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
    <Card className="panel">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Capture
        </CardTitle>
        <Button variant="outline" size="sm" onClick={loadFromClipboard} disabled={busy}>
          <ClipboardPaste />
          ⌘⇧B · Read clipboard
        </Button>
      </CardHeader>

      <CardContent>
        {!draft ? (
          <p className="text-sm text-muted-foreground">
            Copy any text (⌘C), then hit ⌘⇧B — Blink reads your clipboard and sanitizes it locally
            before it ever becomes a task. Nothing leaves this machine.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{draft.source.appId}</Badge>
              <Badge variant="secondary">{draft.source.windowTitle}</Badge>
              {redactions > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldCheck className="size-3" />
                  {redactions} secret(s) redacted locally
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capture-title">Title</Label>
              <Input id="capture-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capture-body">Body (sanitized)</Label>
              <Textarea
                id="capture-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="font-mono text-xs text-blink-code"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button
                onClick={save}
                disabled={busy || !title.trim()}
                className="shadow-[0_6px_20px_-6px_hsl(258_90%_66%/0.55)]"
              >
                <Sparkles />
                Save task
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
