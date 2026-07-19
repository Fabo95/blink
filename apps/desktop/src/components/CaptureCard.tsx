import { useEffect, useState } from 'react';
import { ShortcutRecorder } from '@/components/ShortcutRecorder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { display } from '@/lib/shortcut';

export function CaptureCard() {
  const [shortcut, setShortcut] = useState('');

  useEffect(() => {
    api.getCaptureShortcut().then(setShortcut).catch(() => {});
  }, []);

  return (
    <Card className="panel">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Capture
        </CardTitle>
        <ShortcutRecorder value={shortcut} onChange={setShortcut} />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Hit {display(shortcut) || '⌘⇧B'}: Blink reads your clipboard and sanitizes it locally
          before it ever becomes a task. Nothing leaves this machine.
        </p>
      </CardContent>
    </Card>
  );
}
