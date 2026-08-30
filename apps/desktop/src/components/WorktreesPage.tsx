import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { RepoDeletePopover } from '@/components/worktrees/RepoDeletePopover';
import { WorktreeRow } from '@/components/worktrees/WorktreeRow';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import { useListCursor } from '@/hooks/useListCursor';
import { useManagedRepos } from '@/hooks/useManagedRepos';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

interface PruneState {
  open: boolean;
  loading: boolean;
  candidates: PruneCandidate[];
}

const PRUNE_CLOSED: PruneState = { open: false, loading: false, candidates: [] };
const SECTION_LABEL = 'section-bar text-sm font-semibold uppercase tracking-wide text-primary';

/**
 * The Worktrees page (a nav tab replacing the inbox). Modeled on the inbox: a secondary
 * **Repositories** pill bar on top (like the task-group filter — `←→`/`hl` switches the
 * active repo, `⌘O` adds one via the native picker, `⌫` removes the active one when no
 * worktree is focused, via a confirm popover) above the **Worktrees** list for the active
 * repo (`↑↓`/`jk` cursor, `o` open, `n` new, `⌫` remove, `x` prune). Worktree behaviour
 * settings (base dir, terminal) live under Settings.
 */
export function WorktreesPage() {
  const repos = useManagedRepos();
  const [activePath, setActivePath] = useState<string | null>(null);

  // Default/repair the active repo whenever the list changes.
  useEffect(() => {
    setActivePath((current) => {
      if (repos.repos.length === 0) return null;
      return current && repos.repos.some((repo) => repo.path === current)
        ? current
        : repos.repos[0]?.path ?? "";
    });
  }, [repos.repos]);

  const wt = useWorktrees(activePath);
  const activeRepo = repos.repos.find((repo) => repo.path === activePath) ?? null;
  const linked = wt.worktrees.filter((worktree) => !worktree.isMain);

  const cycleRepo = (delta: number) => {
    if (repos.repos.length === 0) return;
    const idx = Math.max(
      0,
      repos.repos.findIndex((repo) => repo.path === activePath),
    );
    const next = repos.repos[(idx + delta + repos.repos.length) % repos.repos.length];
    if (next) setActivePath(next.path);
  };

  const [removingRepo, setRemovingRepo] = useState<ManagedRepo | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const [removing, setRemoving] = useState<Worktree | null>(null);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [prune, setPrune] = useState<PruneState>(PRUNE_CLOSED);

  const overlayOpen =
    removingRepo !== null || promptOpen || removing !== null || prune.open;
  const cursor = useListCursor(linked, (worktree) => worktree.branch, { enabled: !overlayOpen });

  const closeOverlays = () => {
    setRemovingRepo(null);
    setPromptOpen(false);
    setRemoving(null);
    setPrune(PRUNE_CLOSED);
  };

  const startRemoveRepo = () => {
    if (!activeRepo) return;
    closeOverlays();
    setRemovingRepo(activeRepo);
  };
  const confirmRemoveRepo = async () => {
    if (!removingRepo) return;
    await repos.remove(removingRepo.path);
    setRemovingRepo(null);
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
      await wt.create(name);
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
    setDeleteRemote(false);
    setRemoving(target);
  };
  const confirmRemove = async () => {
    if (!removing) return;
    const target = removing;
    if (cursor.focusedId === target.branch) cursor.advance();
    try {
      // Dirty worktrees need force; a clean one removes without it.
      await wt.remove(target.branch, target.isDirty, deleteRemote);
      setRemoving(null);
    } catch {
      // Keep the confirm open; the hook shows the error.
    }
  };

  const startPrune = async () => {
    closeOverlays();
    setPrune({ open: true, loading: true, candidates: [] });
    try {
      const candidates = await wt.prunePreview();
      setPrune({ open: true, loading: false, candidates });
    } catch {
      // Error surfaced by the hook; close the popover instead of hanging on "Scanning…".
      setPrune(PRUNE_CLOSED);
    }
  };
  const confirmPrune = async () => {
    try {
      await wt.pruneApply();
      closeOverlays();
    } catch {
      // Keep the list open; the hook shows the error.
    }
  };

  // ── Repositories (the pill bar) ──
  useShortcut('repos.add', { enabled: !overlayOpen, callback: () => void repos.pick() });
  useShortcut('repos.remove', {
    // Mirrors group delete: only when no worktree is focused (a focused worktree's `⌫`
    // removes the worktree instead).
    enabled: !overlayOpen && cursor.focused === null && activeRepo !== null,
    callback: startRemoveRepo,
  });
  useShortcut('worktree.switchPrev', {
    enabled: !overlayOpen && repos.repos.length > 1,
    callback: () => cycleRepo(-1),
  });
  useShortcut('worktree.switchNext', {
    enabled: !overlayOpen && repos.repos.length > 1,
    callback: () => cycleRepo(1),
  });
  useShortcut('repoDelete.confirm', {
    enabled: removingRepo !== null,
    callback: () => void confirmRemoveRepo(),
  });
  useShortcut('repoDelete.cancel', {
    enabled: removingRepo !== null,
    callback: () => setRemovingRepo(null),
  });

  // ── Worktrees (the list) ──
  useShortcut('worktree.new', {
    enabled: !overlayOpen && activeRepo !== null,
    callback: startNew,
  });
  useShortcut('worktree.prune', {
    enabled: !overlayOpen && activeRepo !== null,
    callback: () => void startPrune(),
  });
  useShortcut('worktree.open', {
    enabled: !overlayOpen && cursor.focused !== null,
    callback: () => {
      if (cursor.focused) void wt.open(cursor.focused.branch);
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
  useShortcut('worktreeRemove.toggleRemote', {
    enabled: removing !== null,
    callback: () => setDeleteRemote((on) => !on),
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
    <div className="space-y-6">
      <section>
        <Popover
          open={removingRepo !== null}
          onOpenChange={(open) => {
            if (!open) setRemovingRepo(null);
          }}
        >
          <PopoverAnchor asChild>
            {repos.repos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No repositories yet — press ⌘O to add one from anywhere.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {repos.repos.map((repo) => (
                  <Pill
                    key={repo.path}
                    label={repo.name}
                    selected={activeRepo?.path === repo.path}
                    onSelect={() => setActivePath(repo.path)}
                  />
                ))}
              </div>
            )}
          </PopoverAnchor>
          {removingRepo && <RepoDeletePopover repo={removingRepo} />}
        </Popover>
      </section>

      {activeRepo && (
        <section className="space-y-1.5">
          <h2 className={SECTION_LABEL}>Worktrees</h2>
          <Popover
            open={promptOpen || removing !== null || prune.open}
            onOpenChange={(open) => {
              if (!open) {
                setPromptOpen(false);
                setRemoving(null);
                setPrune(PRUNE_CLOSED);
              }
            }}
          >
            <PopoverAnchor asChild>
              <div className="space-y-1">
                {linked.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {wt.loading ? 'Loading…' : 'No worktrees yet — press n to create one.'}
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
                  “{removing.branch}”, its tmux session, and its local branch will be removed
                  {removing.isDirty ? ', including its uncommitted changes' : ''}.
                  {deleteRemote ? ' The remote branch on GitHub is deleted too.' : ''}
                </p>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setDeleteRemote((on) => !on)}
                  className="mt-2 flex w-full items-center gap-2 text-[11px]"
                >
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded border',
                      deleteRemote
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input',
                    )}
                  >
                    {deleteRemote && <Check className="size-2.5" />}
                  </span>
                  <span className={deleteRemote ? 'text-foreground' : 'text-muted-foreground'}>
                    Also delete the remote branch
                  </span>
                  <Kbd className="ml-auto">b</Kbd>
                </button>
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
        </section>
      )}

      {(wt.error || repos.error) && (
        <p className="line-clamp-2 text-[11px] text-destructive">{wt.error || repos.error}</p>
      )}
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
