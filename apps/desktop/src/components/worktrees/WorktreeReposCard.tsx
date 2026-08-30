import { FolderGit2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import { useListCursor } from '@/hooks/useListCursor';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn, errorMessage } from '@/lib/utils';

/**
 * The managed-repo list for the worktree manager. A path field adds a repo (⌘↵, after a
 * git-repo check on the Rust side); the list below is a keyboard cursor (↑↓, click to
 * select) where ⌘⌫ stops tracking the selected repo. Removing here only forgets the repo
 * — it never touches git.
 */
export function WorktreeReposCard() {
  const [repos, setRepos] = useState<ManagedRepo[]>([]);
  const [path, setPath] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setRepos(await api.listManagedRepos());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cursor = useListCursor(repos, (repo) => repo.path, { enabled: true });

  const add = async () => {
    const candidate = path.trim();
    if (!candidate || busy) return;
    setBusy(true);
    setError('');
    try {
      setRepos(await api.addManagedRepo(candidate));
      setPath('');
    } catch (e) {
      setError(errorMessage(e, 'Could not add that repository'));
    } finally {
      setBusy(false);
    }
  };

  const removeFocused = async () => {
    const target = cursor.focused;
    if (!target) return;
    cursor.advance();
    setError('');
    try {
      setRepos(await api.removeManagedRepo(target.path));
    } catch (e) {
      setError(errorMessage(e, 'Could not remove that repository'));
    }
  };

  useShortcut('worktreeRepos.add', {
    enabled: focused && path.trim().length > 0 && !busy,
    callback: () => void add(),
  });
  useShortcut('worktreeRepos.remove', {
    enabled: cursor.focused !== null,
    callback: () => void removeFocused(),
  });

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Worktree repositories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {repos.length > 0 && (
          <div className="space-y-1">
            {repos.map((repo) => {
              const selected = cursor.focusedId === repo.path;
              return (
                <button
                  key={repo.path}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => cursor.setFocusedId(repo.path)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                    selected
                      ? 'border-primary/40 bg-card/70'
                      : 'border-transparent hover:bg-card/40',
                  )}
                >
                  <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 text-sm text-foreground">{repo.name}</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted-foreground">
                    {repo.path}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
          <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Add a repo path (e.g. ~/repositories/blink)"
            className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {busy ? (
            'Checking…'
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            'Repos you add here show up on the Worktrees page. Removing one only stops tracking it.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
