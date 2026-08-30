import { FolderGit2, FolderPlus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useManagedRepos } from '@/hooks/useManagedRepos';

/**
 * The managed-repo list — the "repo stuff". Pick a git repo from anywhere to add it
 * (native folder picker), ✕ to stop tracking one. Repos can live anywhere; each is an
 * independent path. Removing here only forgets the repo — it never touches git. Pick/click
 * only: there's no path typing.
 */
export function ManagedReposCard() {
  const repos = useManagedRepos();

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Repositories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {repos.repos.length > 0 && (
          <div className="space-y-1">
            {repos.repos.map((repo) => (
              <div
                key={repo.path}
                className="group flex items-center gap-2 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-card/40"
              >
                <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-sm text-foreground">{repo.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {repo.path}
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void repos.remove(repo.path)}
                  title="Stop tracking"
                  className="shrink-0 text-muted-foreground opacity-0 transition-colors hover:text-destructive group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void repos.pick()}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <FolderPlus className="size-3.5 shrink-0" />
          Add a repository…
        </button>
        <p className="text-[11px] text-muted-foreground">
          {repos.error ? (
            <span className="text-destructive">{repos.error}</span>
          ) : (
            'Pick any git repo from anywhere. Removing one only stops tracking it.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
