import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAiStatus } from '@/hooks/useAiStatus';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/**
 * Bring-your-own-key. With no key set, a masked field takes one: ⌘↵ tests the
 * connection and (only if it works) saves it to the keychain. Once set, it shows the
 * masked key as an "Active" row — ⌘⌫ removes it (surfaced in the statusline). The key
 * is write-only from here; the webview only ever sees the masked hint via `useAiStatus`.
 */
export function AiCard() {
  const { enabled, keyHint, refresh } = useAiStatus();
  const [key, setKey] = useState('');
  const [focused, setFocused] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const candidate = key.trim();
    if (!candidate || testing) return;
    setTesting(true);
    setError('');
    try {
      await api.setAiApiKey(candidate);
      setKey('');
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not verify that key'));
    } finally {
      setTesting(false);
    }
  };

  const clear = async () => {
    setKey('');
    setError('');
    try {
      await api.clearAiApiKey();
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not remove the key'));
    }
  };

  useShortcut('ai.saveKey', {
    enabled: !enabled && focused && key.trim().length > 0 && !testing,
    callback: () => void save(),
  });
  // Once a key is set there's no field to focus, so enable removal whenever connected.
  useShortcut('ai.clearKey', { enabled, callback: () => void clear() });

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {enabled && keyHint ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-transparent px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-sm text-foreground">{keyHint}</span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-blink-success">
              <span className="size-1.5 rounded-full bg-blink-success" />
              Active
            </span>
          </div>
        ) : (
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
            <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              // biome-ignore lint/a11y/noAutofocus: settings page is keyboard-first — land in the field
              autoFocus
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Paste your OpenAI API key (sk-…)"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {testing ? (
            'Testing connection…'
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : enabled ? (
            'Your OpenAI key is stored in the keychain and powers AI actions (improve, prompt).'
          ) : (
            'Add your own OpenAI key to turn on AI actions (improve, prompt). It stays in your keychain.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
