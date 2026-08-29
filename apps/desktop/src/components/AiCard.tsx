import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAiStatus } from '@/hooks/useAiStatus';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/**
 * Bring-your-own-key: the user pastes their OpenAI key, ⌘↵ tests the connection and
 * (only if it works) saves it to the keychain — ⌘⌫ removes it. The key is write-only
 * from here; the webview only ever learns whether one is set (via `useAiStatus`),
 * which gates every AI action app-wide.
 */
export function AiCard() {
  const { enabled, refresh } = useAiStatus();
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
    enabled: focused && key.trim().length > 0 && !testing,
    callback: () => void save(),
  });
  useShortcut('ai.clearKey', { enabled: focused && enabled, callback: () => void clear() });

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
          <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={enabled ? 'Replace your OpenAI API key' : 'Paste your OpenAI API key (sk-…)'}
            className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {testing ? (
            'Testing connection…'
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : enabled ? (
            <span className="text-blink-success">Connected — AI actions are on.</span>
          ) : (
            'Add your own OpenAI key to turn on AI actions (improve, prompt). It stays in your keychain.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
