import { Check, FolderGit2, GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { ListRow } from '@/components/ui/list-row';
import { Pill } from '@/components/ui/pill';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { EmptyState, ErrorLine, FIELD_LABEL, Section } from '@/components/ui/section';
import { ConversationPicker } from '@/components/worktrees/ConversationPicker';
import { RepoDeletePopover } from '@/components/worktrees/RepoDeletePopover';
import { RepoSetupPopover } from '@/components/worktrees/RepoSetupPopover';
import { WorktreeLine } from '@/components/worktrees/WorktreeLine';
import type { ClaudeConversation } from '@/generated/ClaudeConversation';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import { useListCursor } from '@/hooks/useListCursor';
import { useManagedRepos } from '@/hooks/useManagedRepos';
import { useTaskWorktrees } from '@/hooks/useTaskWorktrees';
import { useWorktreeAttention } from '@/hooks/useWorktreeAttention';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useReloadHandler } from '@/lib/reload';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

interface PruneState {
  open: boolean;
  loading: boolean;
  candidates: PruneCandidate[];
}

const PRUNE_CLOSED: PruneState = { open: false, loading: false, candidates: [] };

/**
 * The Worktrees page (a nav tab). Modeled on the inbox: a **repository** pill bar on top
 * (like the task-group filter — `←→`/`hl` switches the active repo, `⌘o` adds one via the
 * native picker, `⌫` removes the active one when no worktree is focused, `r` edits its setup
 * command) above the **Worktrees** section for the active repo, in the shared row look
 * (`↑↓`/`jk` cursor, `o` opens its terminal, `e` its editor, `n` new — `↑↓` there picks a
 * recent Claude conversation to carry over — `⌫` remove with an in-row confirm, `x` prune).
 * The app-wide `g` reloads the list + PR status. Worktree behaviour settings (location,
 * terminal, editor) live under Settings.
 */
export function WorktreesPage({ helpOpen }: { helpOpen: boolean }) {
  const repos = useManagedRepos();
  const [activePath, setActivePath] = useState<string | null>(null);

  // Default/repair the active repo whenever the list changes.
  useEffect(() => {
    setActivePath((current) => {
      if (repos.repos.length === 0) return null;
      return current && repos.repos.some((repo) => repo.path === current)
        ? current
        : (repos.repos[0]?.path ?? null);
    });
  }, [repos.repos]);

  const wt = useWorktrees(activePath);
  const attention = useWorktreeAttention();
  const taskWorktrees = useTaskWorktrees();
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
  const [settingUpRepo, setSettingUpRepo] = useState<ManagedRepo | null>(null);
  const [setupDraft, setSetupDraft] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const [conversations, setConversations] = useState<ClaudeConversation[]>([]);
  // Index into `conversations`; -1 = start the worktree's Claude fresh.
  const [picked, setPicked] = useState(-1);
  const [removing, setRemoving] = useState<Worktree | null>(null);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [prune, setPrune] = useState<PruneState>(PRUNE_CLOSED);

  const overlayOpen =
    removingRepo !== null ||
    settingUpRepo !== null ||
    promptOpen ||
    removing !== null ||
    prune.open;
  // The page's browse keys stand down under any overlay and under the shell's cheat-sheet.
  const idle = !overlayOpen && !helpOpen;
  const cursor = useListCursor(linked, (worktree) => worktree.branch, { enabled: idle });

  const closeOverlays = () => {
    setRemovingRepo(null);
    setSettingUpRepo(null);
    setPromptOpen(false);
    setRemoving(null);
    setPrune(PRUNE_CLOSED);
  };

  const startSetup = () => {
    if (!activeRepo) return;
    closeOverlays();
    setSetupDraft(activeRepo.setupCommand ?? '');
    setSettingUpRepo(activeRepo);
  };
  const saveSetup = async () => {
    if (!settingUpRepo) return;
    try {
      await repos.setSetupCommand(settingUpRepo.path, setupDraft);
      setSettingUpRepo(null);
    } catch {
      // Error surfaced by the hook; keep the prompt open so the command isn't lost.
    }
  };

  const startRemoveRepo = () => {
    if (!activeRepo) return;
    closeOverlays();
    setRemovingRepo(activeRepo);
  };
  const confirmRemoveRepo = async () => {
    if (!removingRepo) return;
    try {
      await repos.remove(removingRepo.path);
      setRemovingRepo(null);
    } catch {
      // Error surfaced by the hook; keep the confirm open, like every other confirm.
    }
  };

  const startNew = () => {
    closeOverlays();
    setBranch('');
    setConversations([]);
    setPicked(-1);
    setPromptOpen(true);
    void wt.conversations().then(setConversations);
  };
  const submitNew = async () => {
    const name = branch.trim();
    if (!name) return;
    try {
      await wt.create(name, conversations[picked]?.sessionId ?? null);
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
  useShortcut('repos.add', { enabled: idle, callback: () => void repos.pick() });
  useShortcut('repos.remove', {
    // Mirrors group delete: only when no worktree is focused (a focused worktree's `⌫`
    // removes the worktree instead).
    enabled: idle && cursor.focused === null && activeRepo !== null,
    callback: startRemoveRepo,
  });
  useShortcut('worktree.switchPrev', {
    enabled: idle && repos.repos.length > 1,
    callback: () => cycleRepo(-1),
  });
  useShortcut('worktree.switchNext', {
    enabled: idle && repos.repos.length > 1,
    callback: () => cycleRepo(1),
  });
  useShortcut('repos.setup', {
    enabled: idle && activeRepo !== null,
    callback: startSetup,
  });
  useShortcut('repoSetup.save', {
    enabled: settingUpRepo !== null,
    callback: () => void saveSetup(),
  });
  useShortcut('repoSetup.cancel', {
    enabled: settingUpRepo !== null,
    callback: () => setSettingUpRepo(null),
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
    enabled: idle && activeRepo !== null,
    callback: startNew,
  });
  useShortcut('worktree.prune', {
    enabled: idle && activeRepo !== null,
    callback: () => void startPrune(),
  });
  // Part of the app-wide `g`: the list + its PR status.
  useReloadHandler(() => wt.refresh());
  useShortcut('worktree.terminal', {
    enabled: idle && cursor.focused !== null,
    callback: () => {
      if (cursor.focused) void wt.openInTerminal(cursor.focused.branch);
    },
  });
  useShortcut('worktree.editor', {
    enabled: idle && cursor.focused !== null,
    callback: () => {
      if (cursor.focused) void wt.openInEditor(cursor.focused.branch);
    },
  });
  useShortcut('worktree.remove', {
    enabled: idle && cursor.focused !== null,
    callback: startRemove,
  });

  useShortcut('worktreeNew.submit', { enabled: promptOpen, callback: () => void submitNew() });
  useShortcut('worktreeNew.down', {
    enabled: promptOpen && conversations.length > 0,
    callback: () => setPicked((i) => Math.min(i + 1, conversations.length - 1)),
  });
  useShortcut('worktreeNew.up', {
    enabled: promptOpen && conversations.length > 0,
    callback: () => setPicked((i) => Math.max(i - 1, -1)),
  });
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
  useShortcut('worktreePrune.cancel', {
    enabled: prune.open,
    callback: () => setPrune(PRUNE_CLOSED),
  });

  return (
    <div className="space-y-6">
      <Popover
        open={removingRepo !== null || settingUpRepo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemovingRepo(null);
            setSettingUpRepo(null);
          }
        }}
      >
        <PopoverAnchor asChild>
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
        </PopoverAnchor>
        {removingRepo && <RepoDeletePopover repo={removingRepo} />}
        {settingUpRepo && (
          <RepoSetupPopover repo={settingUpRepo} value={setupDraft} onChange={setSetupDraft} />
        )}
      </Popover>

      <Section
        title="Worktrees"
        count={activeRepo ? linked.length : undefined}
        busy={wt.loading || wt.statusLoading}
      >
        <Popover
          open={promptOpen || prune.open}
          onOpenChange={(open) => {
            if (!open) {
              setPromptOpen(false);
              setPrune(PRUNE_CLOSED);
            }
          }}
        >
          <PopoverAnchor asChild>
            <div>
              {repos.repos.length === 0 ? (
                <EmptyState icon={FolderGit2}>
                  No repositories yet — add one with <Kbd>⌘o</Kbd>.
                </EmptyState>
              ) : linked.length === 0 ? (
                <EmptyState icon={GitBranch}>
                  {wt.loading ? (
                    'Loading worktrees…'
                  ) : (
                    <>
                      No worktrees yet — create one with <Kbd>n</Kbd>.
                    </>
                  )}
                </EmptyState>
              ) : (
                <ul className="space-y-2">
                  {linked.map((worktree) => {
                    const confirming = removing?.branch === worktree.branch;
                    return (
                      <li key={worktree.branch}>
                        <Popover
                          open={confirming}
                          onOpenChange={(open) => {
                            if (!open) setRemoving(null);
                          }}
                        >
                          <PopoverAnchor asChild>
                            <ListRow
                              state={
                                confirming
                                  ? 'confirming'
                                  : cursor.focusedId === worktree.branch
                                    ? 'focused'
                                    : 'idle'
                              }
                              onSelect={() => cursor.setFocusedId(worktree.branch)}
                            >
                              <WorktreeLine
                                worktree={worktree}
                                statusLoading={wt.statusLoading}
                                task={
                                  taskWorktrees.links.find(
                                    (link) =>
                                      link.repoPath === activePath &&
                                      link.branch === worktree.branch,
                                  )?.taskText
                                }
                                attention={
                                  activePath
                                    ? attention.attentionOf(activePath, worktree.branch)
                                    : null
                                }
                              />
                            </ListRow>
                          </PopoverAnchor>
                          {confirming && removing && (
                            <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
                              <p className="text-sm font-medium">Remove this worktree?</p>
                              <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                                “{removing.branch}”, its tmux session, and its local branch will be
                                removed
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
                                    'flex size-3.5 shrink-0 items-center justify-center',
                                    'rounded border',
                                    deleteRemote
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-input',
                                  )}
                                >
                                  {deleteRemote && <Check className="size-2.5" />}
                                </span>
                                <span
                                  className={
                                    deleteRemote ? 'text-foreground' : 'text-muted-foreground'
                                  }
                                >
                                  Also delete the remote branch
                                </span>
                              </button>
                            </PopoverContent>
                          )}
                        </Popover>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </PopoverAnchor>
          {promptOpen && (
            <PopoverContent
              align="start"
              sideOffset={8}
              className={conversations.length > 0 ? 'w-96 p-3' : 'w-72 p-3'}
            >
              <p className={cn(FIELD_LABEL, 'mb-2')}>New worktree</p>
              <Input
                // biome-ignore lint/a11y/noAutofocus: keyboard-first — land in the branch field
                autoFocus
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="branch name (e.g. feat/thing)"
                className="h-8 text-sm"
              />
              {conversations.length > 0 && (
                <ConversationPicker
                  conversations={conversations}
                  picked={picked}
                  onPick={setPicked}
                />
              )}
              {wt.error && (
                <div className="mt-2">
                  <ErrorLine>{wt.error}</ErrorLine>
                </div>
              )}
            </PopoverContent>
          )}
          {prune.open && (
            <PopoverContent align="start" sideOffset={8} className="w-80 p-3">
              <p className="text-sm font-medium">Prune merged or gone worktrees?</p>
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
        {(wt.error || repos.error) && !promptOpen && (
          <div className="mt-2">
            <ErrorLine>{wt.error || repos.error}</ErrorLine>
          </div>
        )}
      </Section>
    </div>
  );
}
