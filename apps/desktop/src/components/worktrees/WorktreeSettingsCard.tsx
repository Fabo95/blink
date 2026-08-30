import { FolderTree, Terminal as TerminalIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/**
 * Worktree behaviour settings — the "worktree stuff" config. **Location** (where worktrees
 * are created) is a native folder picker: click to choose, ✕ to reset to the default. The
 * **Terminal** command (how a worktree opens) is free text — you can't pick a command — and
 * saves on ⌘↵.
 */
export function WorktreeSettingsCard() {
  // null = use the derived default (a worktrees/ folder beside each repo).
  const [baseDir, setBaseDir] = useState<string | null>(null);

  const [terminal, setTerminal] = useState('');
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [savingTerminal, setSavingTerminal] = useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        setBaseDir(await api.getWorktreeBaseDir());
        setTerminal(await api.getWorktreeTerminal());
      } catch (e) {
        setError(errorMessage(e, 'Could not load worktree settings'));
      }
    })();
  }, []);

  // The native picker saves on the Rust side, so we just reflect the result.
  const pickBaseDir = async () => {
    setError('');
    try {
      const picked = await api.pickWorktreeBaseDir();
      if (picked !== null) setBaseDir(picked);
    } catch (e) {
      setError(errorMessage(e, 'Could not open the folder picker'));
    }
  };

  const resetBaseDir = async () => {
    setError('');
    try {
      await api.setWorktreeBaseDir(null);
      setBaseDir(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not reset the location'));
    }
  };

  const saveTerminal = async () => {
    if (savingTerminal) return;
    setSavingTerminal(true);
    setError('');
    try {
      const value = terminal.trim();
      await api.setWorktreeTerminal(value ? value : null);
      setTerminal(await api.getWorktreeTerminal());
    } catch (e) {
      setError(errorMessage(e, 'Could not save the terminal command'));
    } finally {
      setSavingTerminal(false);
    }
  };

  useShortcut('worktreeTerminal.save', {
    enabled: terminalFocused && !savingTerminal,
    callback: () => void saveTerminal(),
  });

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Worktrees
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Location
          </p>
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pickBaseDir()}
              title="Choose a folder"
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-muted-foreground transition-colors hover:text-foreground"
            >
              <FolderTree className="size-3.5 shrink-0" />
              <span
                className={baseDir ? 'truncate text-sm text-foreground' : 'truncate text-sm'}
              >
                {baseDir ?? 'Default — a worktrees/ folder beside each repo'}
              </span>
            </button>
            {baseDir && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void resetBaseDir()}
                title="Reset to default"
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Click the folder to choose a base directory — worktrees go under
            &lt;base&gt;/&lt;repo&gt;/&lt;branch&gt;.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Terminal
          </p>
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
            <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              onFocus={() => setTerminalFocused(true)}
              onBlur={() => setTerminalFocused(false)}
              placeholder="alacritty -e tmux attach -t {session}"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[13px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {savingTerminal
              ? 'Saving…'
              : 'Command that opens a worktree. {session} is the tmux session; empty resets to the default.'}
          </p>
        </div>

        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
