import { useEffect, useState } from 'react';
import { ShortcutRecorder } from '@/components/ShortcutRecorder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

export function CaptureCard() {
  const [copyShortcut, setCopyShortcut] = useState('');
  const [manualShortcut, setManualShortcut] = useState('');

  useEffect(() => {
    api
      .getCaptureShortcut('copy')
      .then(setCopyShortcut)
      .catch(() => {});
    api
      .getCaptureShortcut('manual')
      .then(setManualShortcut)
      .catch(() => {});
  }, []);

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Capture
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Copy</span> — grab the selection,
            sanitized on-device.
          </p>
          <ShortcutRecorder method="copy" value={copyShortcut} onChange={setCopyShortcut} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Manual</span> — type a task from scratch.
          </p>
          <ShortcutRecorder method="manual" value={manualShortcut} onChange={setManualShortcut} />
        </div>
      </CardContent>
    </Card>
  );
}
