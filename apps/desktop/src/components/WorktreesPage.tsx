import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { WorktreeRow } from '@/components/worktrees/WorktreeRow';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import { useListCursor } from '@/hooks/useListCursor';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

interface PruneState {
  open: boolean;
  loading: boolean;
  candidates: PruneCandidate[];
}

const PRUNE_CLOSED: PruneState = { open: false, loading: false, candidates: [] };

/**
 * The Worktrees page (a nav tab replacing the inbox). Repo pills switch the active repo
 * (`←→`/`hl`); a keyboard cursor walks its linked worktrees (`↑↓`/`jk`). Actions are
 * shortcuts: `o` opens a terminal on the worktree, `n` creates one, `⌫` removes the
 * focused one, `x` prunes merged/gone worktrees. Each opener is a popover anchored to the
 * list, confirmed with `⌘↵` / dismissed with `Esc` — no buttons.
 */
export function WorktreesPage() {
  const view = useWorktrees();
  const linked = view.worktrees.filter((worktree) => !worktree.isMain);

  const [promptOpen, setPromptOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const [removing, setRemoving] = useState<Worktree | null>(null);
  const [prune, setPrune] = useState<PruneState>(PRUNE_CLOSED);

  const overlayOpen = promptOpen || removing !== null || prune.open;
  const cursor = useListCursor(linked, (worktree) => worktree.branch, { enabled: !overlayOpen });

  const closeOverlays = () => {
    setPromptOpen(false);
    setRemoving(null);
    setPrune(PRUNE_CLOSED);
  };

  const startNew = () => {
    closeOverlays();
    setBranch('');
    setPromptOpen(true);
  };
  const submitNew = async () => {
    const name = branch.trim();
    if (!name) return;
    try {
      await view.create(name);
      setPromptOpen(false);
      setBranch('');
    } catch {
      // Error surfaced by the hook; keep the prompt open so the branch name isn't lost.
    }
  };

  const startRemove = () => {
    if (!cursor.focused) return;
    const target = cursor.focused;
    closeOverlays();
    setRemoving(target);
  };
  const confirmRemove = async () => {
    if (!removing) return;
    const target = removing;
    if (cursor.focusedId === target.branch) cursor.advance();
    try {
      // Dirty worktrees need force; a clean one removes without it.
      await view.remove(target.branch, target.isDirty);
      setRemoving(null);
    } catch {
      // Keep the confirm open; the hook shows the error.
    }
  };

  const startPrune = async () => {
    closeOverlays();
    setPrune({ open: true, loading: true, candidates: [] });
    const candidates = await view.prunePreview();
    setPrune({ open: true, loading: false, candidates });
  };
  const confirmPrune = async () => {
    try {
      await view.pruneApply();
      closeOverlays();
    } catch {
      // Keep the list open; the hook shows the error.
    }
  };

  useShortcut('worktree.switchPrev', {
    enabled: !overlayOpen && view.repos.length > 1,
    callback: () => view.cycleRepo(-1),
  });
  useShortcut('worktree.switchNext', {
    enabled: !overlayOpen && view.repos.length > 1,
    callback: () => view.cycleRepo(1),
  });
  useShortcut('worktree.new', {
    enabled: !overlayOpen && view.activeRepo !== null,
    callback: startNew,
  });
  useShortcut('worktree.prune', {
    enabled: !overlayOpen && view.activeRepo !== null,
    callback: () => void startPrune(),
  });
  useShortcut('worktree.open', {
    enabled: !overlayOpen && cursor.focused !== null,
    callback: () => {
      if (cursor.focused) void view.open(cursor.focused.branch);
    },
  });
  useShortcut('worktree.remove', {
    enabled: !overlayOpen && cursor.focused !== null,
    callback: startRemove,
  });

  useShortcut('worktreeNew.submit', { enabled: promptOpen, callback: () => void submitNew() });
  useShortcut('worktreeNew.cancel', { enabled: promptOpen, callback: () => setPromptOpen(false) });
  useShortcut('worktreeRemove.confirm', {
    enabled: removing !== null,
    callback: () => void confirmRemove(),
  });
  useShortcut('worktreeRemove.cancel', {
    enabled: removing !== null,
    callback: () => setRemoving(null),
  });
  useShortcut('worktreePrune.confirm', {
    enabled: prune.open && !prune.loading && prune.candidates.length > 0,
    callback: () => void confirmPrune(),
  });
  useShortcut('worktreePrune.cancel', { enabled: prune.open, callback: () => setPrune(PRUNE_CLOSED) });

  return (
    <div className="space-y-4">
      <h2 className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
        Worktrees
      </h2>
      {view.repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No repositories yet — add one in Settings to manage its worktrees here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {view.repos.map((repo) => (
              <Pill
                key={repo.path}
                label={repo.name}
                selected={view.activeRepo?.path === repo.path}
                onSelect={() => view.selectRepo(repo.path)}
              />
            ))}
          </div>
          <Popover
            open={overlayOpen}
            onOpenChange={(open) => {
              if (!open) closeOverlays();
            }}
          >
            <PopoverAnchor asChild>
              <div className="space-y-1">
                {linked.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {view.loading ? 'Loading…' : 'No worktrees yet — press n to create one.'}
                  </p>
                ) : (
                  linked.map((worktree) => (
                    <WorktreeRow
                      key={worktree.branch}
                      worktree={worktree}
                      selected={cursor.focusedId === worktree.branch}
                      onSelect={() => cursor.setFocusedId(worktree.branch)}
                    />
                  ))
                )}
              </div>
            </PopoverAnchor>
            {promptOpen && (
              <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  New worktree
                </p>
                <Input
                  // biome-ignore lint/a11y/noAutofocus: keyboard-first — land in the branch field
                  autoFocus
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="branch name (e.g. feat/thing)"
                  className="h-8 text-sm"
                />
              </PopoverContent>
            )}
            {removing && (
              <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
                <p className="text-sm font-medium">Remove this worktree?</p>
                <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                  “{removing.branch}” and its tmux session will be removed
                  {removing.isDirty ? ', including its uncommitted changes' : ''}. The branch is
                  kept.
                </p>
              </PopoverContent>
            )}
            {prune.open && (
              <PopoverContent align="start" sideOffset={8} className="w-80 p-3">
                <p className="text-sm font-medium">Prune worktrees</p>
                {prune.loading ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">Scanning…</p>
                ) : prune.candidates.length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Nothing to prune — no merged or gone worktrees.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {prune.candidates.map((candidate) => (
                      <li
                        key={candidate.branch}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="truncate text-foreground">{candidate.branch}</span>
                        <span className="shrink-0 text-muted-foreground">{candidate.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            )}
          </Popover>
        </>
      )}
      {view.error && <p className="line-clamp-2 text-[11px] text-destructive">{view.error}</p>}
    </div>
  );
}

// Mouse-only repo selector (like the group filter pills): out of the Tab order, mousedown
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
