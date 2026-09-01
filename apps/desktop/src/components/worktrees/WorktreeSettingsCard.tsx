import { FolderTree, PenLine, Terminal as TerminalIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { EditorOption } from '@/generated/EditorOption';
import type { TerminalOption } from '@/generated/TerminalOption';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn, errorMessage } from '@/lib/utils';

/**
 * Worktree behaviour settings — the "worktree stuff" config. **Location** (where worktrees
 * are created) is a native folder picker: click to choose, ✕ to reset to the default. The
 * **Terminal** (how a worktree opens) and the **Editor** (how `e` opens its folder) are each
 * picked from the terminals/editors Blink detects — click one — with a "Custom…" pill that
 * falls back to a free-text command for anything unlisted.
 */
export function WorktreeSettingsCard() {
  // null = use the derived default (a worktrees/ folder beside each repo).
  const [baseDir, setBaseDir] = useState<string | null>(null);

  const [terminal, setTerminal] = useState('');
  const [terminals, setTerminals] = useState<TerminalOption[]>([]);
  const [customTerminal, setCustomTerminal] = useState(false);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [savingTerminal, setSavingTerminal] = useState(false);

  const [editor, setEditor] = useState('');
  const [editors, setEditors] = useState<EditorOption[]>([]);
  const [customEditor, setCustomEditor] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [savingEditor, setSavingEditor] = useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        setBaseDir(await api.getWorktreeBaseDir());
        const [termCommand, detectedTerminals, editorCommand, detectedEditors] =
          await Promise.all([
            api.getWorktreeTerminal(),
            api.listTerminals(),
            api.getWorktreeEditor(),
            api.listEditors(),
          ]);
        setTerminal(termCommand);
        setTerminals(detectedTerminals);
        setEditor(editorCommand);
        setEditors(detectedEditors);
        // Fall back to the free-text field only when the current command isn't one we detect.
        setCustomTerminal(!detectedTerminals.some((o) => o.command === termCommand));
        setCustomEditor(!detectedEditors.some((o) => o.command === editorCommand));
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

  const saveEditor = async () => {
    if (savingEditor) return;
    setSavingEditor(true);
    setError('');
    try {
      const value = editor.trim();
      await api.setWorktreeEditor(value ? value : null);
      setEditor(await api.getWorktreeEditor());
    } catch (e) {
      setError(errorMessage(e, 'Could not save the editor command'));
    } finally {
      setSavingEditor(false);
    }
  };

  // Picking a detected terminal saves its command immediately — no typing, no ⌘↵.
  const selectTerminal = async (command: string) => {
    setCustomTerminal(false);
    setTerminal(command);
    setError('');
    try {
      await api.setWorktreeTerminal(command);
    } catch (e) {
      setError(errorMessage(e, 'Could not save the terminal'));
    }
  };

  // Picking a detected editor saves its command immediately — no typing, no ⌘↵.
  const selectEditor = async (command: string) => {
    setCustomEditor(false);
    setEditor(command);
    setError('');
    try {
      await api.setWorktreeEditor(command);
    } catch (e) {
      setError(errorMessage(e, 'Could not save the editor'));
    }
  };

  useShortcut('worktreeTerminal.save', {
    enabled: terminalFocused && !savingTerminal,
    callback: () => void saveTerminal(),
  });
  useShortcut('worktreeEditor.save', {
    enabled: editorFocused && !savingEditor,
    callback: () => void saveEditor(),
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
          <div className="flex flex-wrap items-center gap-1.5">
            {terminals.map((option) => (
              <Pill
                key={option.command}
                label={option.name}
                selected={!customTerminal && terminal === option.command}
                onSelect={() => void selectTerminal(option.command)}
              />
            ))}
            <Pill
              label="Custom…"
              selected={customTerminal}
              onSelect={() => setCustomTerminal(true)}
            />
          </div>
          {customTerminal && (
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
          )}
          <p className="text-[11px] text-muted-foreground">
            {savingTerminal
              ? 'Saving…'
              : customTerminal
                ? 'Command that opens a worktree. {session} is the tmux session; ⌘↵ saves.'
                : 'Which terminal a worktree opens in (running Claude via tmux).'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Editor
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {editors.map((option) => (
              <Pill
                key={option.command}
                label={option.name}
                selected={!customEditor && editor === option.command}
                onSelect={() => void selectEditor(option.command)}
              />
            ))}
            <Pill
              label="Custom…"
              selected={customEditor}
              onSelect={() => setCustomEditor(true)}
            />
          </div>
          {customEditor && (
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
              <PenLine className="size-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={editor}
                onChange={(e) => setEditor(e.target.value)}
                onFocus={() => setEditorFocused(true)}
                onBlur={() => setEditorFocused(false)}
                placeholder="webstorm {path}"
                className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[13px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {savingEditor
              ? 'Saving…'
              : customEditor
                ? 'Command the e shortcut runs. {path} is the worktree path; ⌘↵ saves.'
                : 'Which editor the e shortcut opens a worktree in.'}
          </p>
        </div>

        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

// Mouse-only selector (like the repo / group-filter pills): out of the Tab order, mousedown
// preventDefault keeps focus on <body> so the keyboard shortcuts keep firing.
function Pill({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
        selected
          ? 'border-primary/40 bg-card/70 text-foreground'
          : 'border-border/60 bg-card/40 text-muted-foreground',
      )}
    >
      {label}
    </button>
  );
}
