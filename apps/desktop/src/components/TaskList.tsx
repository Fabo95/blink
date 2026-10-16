import { Inbox } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ArchivePage } from '@/components/tasks/ArchivePage';
import { GroupFilterBar } from '@/components/tasks/GroupFilterBar';
import { StartWorktreePopover } from '@/components/tasks/StartWorktreePopover';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { TaskRow } from '@/components/tasks/TaskRow';
import { EmptyState, ErrorLine, Section } from '@/components/ui/section';
import type { Task } from '@/generated/Task';
import type { TaskEffort } from '@/generated/TaskEffort';
import { useAiStatus } from '@/hooks/useAiStatus';
import { useArchive } from '@/hooks/useArchive';
import { useListCursor } from '@/hooks/useListCursor';
import { useManagedRepos } from '@/hooks/useManagedRepos';
import { useTaskEditor } from '@/hooks/useTaskEditor';
import { useTaskGroups } from '@/hooks/useTaskGroups';
import { useTaskWorktrees } from '@/hooks/useTaskWorktrees';
import { api } from '@/lib/api';
import { splitTasks } from '@/lib/completed';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { branchSlug } from '@/lib/slug';
import { errorMessage } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
  /** The shell's cheat-sheet is open: the list's keys stand down. */
  helpOpen: boolean;
}

export function TaskList({ tasks, onChanged, helpOpen }: TaskListProps) {
  const [error, setError] = useState('');
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  // The `p` prompt action for a single row: `loading` while generating, `copied` for a
  // brief confirmation. The copied state auto-clears via the ref'd timeout below.
  const [promptState, setPromptState] = useState<{
    id: string;
    status: 'loading' | 'copied';
  } | null>(null);
  const promptResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The Archive is its own page, reached with `a` — while it's open the inbox (filter bar,
  // Inbox/Completed) is replaced by the archive view. Lifted here (above the two
  // hooks that read it) so both the group filter and the archive derivation stay in sync.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const report = (e: unknown, fallback: string) => setError(errorMessage(e, fallback));

  const editor = useTaskEditor({ onSaved: onChanged, setError });
  const { enabled: aiEnabled } = useAiStatus();
  const isEditing = editor.task !== null;
  const repos = useManagedRepos();
  const taskWorktrees = useTaskWorktrees();
  // The `w` prompt: which task, which repo, which branch.
  const [startingTask, setStartingTask] = useState<Task | null>(null);
  const [worktreeRepo, setWorktreeRepo] = useState<string | null>(null);
  const [worktreeBranch, setWorktreeBranch] = useState('');
  // The browsing shortcuts are enabled exactly while no overlay (editor, delete dialogs,
  // worktree prompt, group prompt, help sheet) owns the keyboard — each overlay's own
  // shortcuts enable on its state.
  const baseEnabled =
    !isEditing && deletingTask === null && startingTask === null && !helpOpen;
  const taskGroups = useTaskGroups({ enabled: baseEnabled, canManage: !archiveOpen });
  const enabled = baseEnabled && !taskGroups.busy;

  // Filtering before the split keeps every section (and its count) on the same filter.
  const visible =
    taskGroups.selectedId === null
      ? tasks
      : tasks.filter((t) => t.taskGroupId === taskGroups.selectedId);
  const { quick, active, recentCompleted, archived } = splitTasks(visible);
  // One Inbox section, with the ≤5-min pile hoisted to the top of it — the badge on each
  // row carries the label, so no second section is needed to say it. `deep` is not
  // demoted: only the quick batch moves, everything else keeps its manual order.
  const open = [...quick, ...active];
  // A reorder swaps within the row's own rung, so `⌥↑↓` can't fight the hoist.
  const quickIds = new Set(quick.map((t) => t.id));
  const groupNames = new Map(taskGroups.groups.map((g) => [g.id, g.name]));
  const archive = useArchive(archived, { enabled, open: archiveOpen, setOpen: setArchiveOpen });

  const toggleComplete = async (task: Task) => {
    try {
      await api.updateTask(task.id, { completed: task.status !== 'done' });
      onChanged();
    } catch (e) {
      report(e, 'Could not update task');
    }
  };

  const openLink = async (task: Task) => {
    if (!task.link) return;
    try {
      await api.openLink(task.link);
    } catch (e) {
      report(e, 'Could not open link');
    }
  };

  // Generate an AI prompt for the task and copy it to the clipboard (the Rust command does
  // the copy). Ignore re-presses while one is in flight; clear any pending copied-reset so a
  // stale timer can't wipe a newer row's state.
  const generatePrompt = async (task: Task) => {
    if (promptState?.status === 'loading') return;
    if (promptResetTimeout.current) {
      clearTimeout(promptResetTimeout.current);
      promptResetTimeout.current = null;
    }
    setPromptState({ id: task.id, status: 'loading' });
    try {
      await api.generateTaskPrompt(task.id);
      setPromptState({ id: task.id, status: 'copied' });
      promptResetTimeout.current = setTimeout(() => setPromptState(null), 2000);
    } catch (e) {
      setPromptState(null);
      report(e, 'Could not generate prompt');
    }
  };

  // Label the expected effort (`1`/`2`/`3`). The row may jump between Quick hits and the
  // Inbox; the cursor tracks it by id, so it stays focused where it lands.
  const setEffort = async (task: Task, effort: TaskEffort) => {
    if (task.effort === effort) return;
    try {
      await api.updateTask(task.id, { effort });
      onChanged();
    } catch (e) {
      report(e, 'Could not set the effort');
    }
  };

  // Reordering is inbox-only, and stays within the row's own rung.
  const moveActive = async (task: Task, delta: -1 | 1) => {
    const rung = quickIds.has(task.id) ? quick : active;
    const idx = rung.findIndex((t) => t.id === task.id);
    const neighbour = idx === -1 ? undefined : rung[idx + delta];
    if (!neighbour) return;
    try {
      await api.reorderTask(task.id, neighbour.id);
      onChanged();
    } catch (e) {
      report(e, 'Could not reorder task');
    }
  };

  // One cursor over whichever page is showing: the inbox (Inbox + Completed, both always
  // open) or the archive page (its current, searched, paged slice) — never both at once.
  const navItems = archiveOpen ? archive.items : [...open, ...recentCompleted];
  const {
    focusedId,
    setFocusedId,
    focused: focusedTask,
    advance,
  } = useListCursor(navItems, (t) => t.id, { enabled });

  // The focused row's actions — enabled here (not in the cursor) because their gates
  // need the task's data.
  const focusedEnabled = enabled && focusedTask !== null;
  useShortcut('task.toggle', {
    enabled: focusedEnabled,
    callback: () => {
      if (!focusedTask) return;
      // The row leaves its section — move the cursor to a neighbour first.
      advance();
      void toggleComplete(focusedTask);
    },
  });
  useShortcut('task.edit', {
    enabled: focusedEnabled,
    callback: () => {
      if (focusedTask) editor.start(focusedTask);
    },
  });
  useShortcut('task.open', {
    enabled: focusedEnabled && focusedTask?.link != null,
    callback: () => {
      if (focusedTask) void openLink(focusedTask);
    },
  });
  useShortcut('task.prompt', {
    enabled: focusedEnabled && aiEnabled,
    callback: () => {
      if (focusedTask) void generatePrompt(focusedTask);
    },
  });
  useShortcut('task.delete', {
    enabled: focusedEnabled,
    callback: () => {
      if (focusedTask) setDeletingTask(focusedTask);
    },
  });
  // Labelling and reordering both apply to open rows only — Quick hits + Inbox together
  // are every non-done task, so completed and archived rows are excluded by status.
  const rowIsOpen = focusedEnabled && focusedTask?.status !== 'done';
  useShortcut('task.effortQuick', {
    enabled: rowIsOpen,
    callback: () => {
      if (focusedTask) void setEffort(focusedTask, 'quick');
    },
  });
  useShortcut('task.effortStandard', {
    enabled: rowIsOpen,
    callback: () => {
      if (focusedTask) void setEffort(focusedTask, 'standard');
    },
  });
  useShortcut('task.effortDeep', {
    enabled: rowIsOpen,
    callback: () => {
      if (focusedTask) void setEffort(focusedTask, 'deep');
    },
  });
  useShortcut('task.moveUp', {
    enabled: rowIsOpen,
    callback: () => {
      if (focusedTask) void moveActive(focusedTask, -1);
    },
  });
  useShortcut('task.moveDown', {
    enabled: rowIsOpen,
    callback: () => {
      if (focusedTask) void moveActive(focusedTask, 1);
    },
  });

  // One horizontal axis, arrows + vim like ↑↓/jk: on the archive page its pager owns ←→/hl
  // (enabled in useArchive), on the inbox they cycle the group filter.
  const canCycleGroups = enabled && !archiveOpen && taskGroups.groups.length > 0;
  useShortcut('filter.prev', { enabled: canCycleGroups, callback: () => taskGroups.cycle(-1) });
  useShortcut('filter.next', { enabled: canCycleGroups, callback: () => taskGroups.cycle(1) });

  // `⌫` deletes the selected group — inbox only, and only while no task is focused, so it
  // stays mutually exclusive with `task.delete` (same key).
  useShortcut('group.delete', {
    enabled: enabled && !archiveOpen && focusedTask === null && taskGroups.selected !== null,
    callback: taskGroups.requestDelete,
  });

  // `Esc` leaves the archive page — but only with no row focused, so a focused row's Esc
  // clears the selection first (`a` always toggles the page, regardless of focus).
  useShortcut('archive.close', {
    enabled: enabled && archiveOpen && focusedTask === null,
    callback: () => setArchiveOpen(false),
  });

  // The list is driven by the cursor, not DOM focus — while browsing, Tab would just
  // throw a stray focus ring around, so swallow it (preventDefault is the whole action).
  // Stand down while a two-field group prompt (new / edit) is open, so its own ⇥ can move
  // between the name and context fields.
  useShortcut('browse.swallowTab', {
    enabled: !isEditing && taskGroups.prompt === null,
    callback: () => {},
  });

  // Keep the focused row in view as the cursor moves (`nearest` scrolls the minimum).
  useEffect(() => {
    if (!focusedId) return;
    document.querySelector(`[data-task-id="${focusedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  // Don't let the copied-reset timer fire after unmount.
  useEffect(
    () => () => {
      if (promptResetTimeout.current) clearTimeout(promptResetTimeout.current);
    },
    [],
  );

  const confirmDelete = async () => {
    const task = deletingTask;
    if (!task) return;
    // Keep the cursor in place: move it to a neighbour before the row leaves.
    const idx = navItems.findIndex((t) => t.id === task.id);
    const neighbour = navItems[idx + 1] ?? navItems[idx - 1] ?? null;
    setFocusedId(neighbour ? neighbour.id : null);
    setDeletingTask(null);
    try {
      await api.deleteTask(task.id);
      onChanged();
    } catch (e) {
      report(e, 'Could not delete task');
    }
  };
  // The confirm dialog has no buttons — ⌘↵ confirms; Esc (also Radix's backdrop) cancels.
  const confirmingDelete = deletingTask !== null;
  useShortcut('taskDelete.confirm', {
    enabled: confirmingDelete,
    callback: () => void confirmDelete(),
  });
  useShortcut('taskDelete.cancel', {
    enabled: confirmingDelete,
    callback: () => setDeletingTask(null),
  });

  // `w`: start the focused (open) task in a worktree — repo defaults to the first managed
  // one, the branch to a slug of the task.
  const openWorktreePrompt = (task: Task) => {
    taskWorktrees.clearError();
    setWorktreeRepo(repos.repos[0]?.path ?? null);
    setWorktreeBranch(branchSlug(task.text));
    setStartingTask(task);
  };
  const closeWorktreePrompt = () => setStartingTask(null);
  const startWorktree = async () => {
    if (!startingTask || !worktreeRepo || !worktreeBranch.trim()) return;
    try {
      await taskWorktrees.start(startingTask.id, worktreeRepo, worktreeBranch.trim());
      setStartingTask(null);
    } catch {
      // Error surfaced in the prompt by the hook; keep it open to fix the branch or repo.
    }
  };
  const cycleWorktreeRepo = (delta: number) => {
    const count = repos.repos.length;
    if (count === 0) return;
    const idx = Math.max(
      0,
      repos.repos.findIndex((repo) => repo.path === worktreeRepo),
    );
    setWorktreeRepo(repos.repos[(idx + delta + count) % count]?.path ?? null);
  };
  useShortcut('task.worktree', {
    enabled: focusedEnabled && focusedTask?.status !== 'done',
    callback: () => {
      if (focusedTask) openWorktreePrompt(focusedTask);
    },
  });
  const promptingWorktree = startingTask !== null && !taskWorktrees.starting;
  useShortcut('taskWorktree.start', {
    enabled: promptingWorktree && worktreeRepo !== null && worktreeBranch.trim().length > 0,
    callback: () => void startWorktree(),
  });
  useShortcut('taskWorktree.nextRepo', {
    enabled: promptingWorktree && repos.repos.length > 1,
    callback: () => cycleWorktreeRepo(1),
  });
  useShortcut('taskWorktree.prevRepo', {
    enabled: promptingWorktree && repos.repos.length > 1,
    callback: () => cycleWorktreeRepo(-1),
  });
  useShortcut('taskWorktree.cancel', {
    enabled: startingTask !== null,
    callback: closeWorktreePrompt,
  });

  const renderRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      focused={focusedId === task.id}
      editing={editor.isEditing(task.id)}
      confirmingDelete={deletingTask?.id === task.id}
      groupName={
        // Redundant while a group filter is active — every visible row shares it.
        taskGroups.selectedId === null && task.taskGroupId
          ? groupNames.get(task.taskGroupId)
          : undefined
      }
      promptStatus={promptState?.id === task.id ? promptState.status : undefined}
      onSelect={(t) => setFocusedId(t.id)}
      onToggleComplete={toggleComplete}
      onOpenLink={openLink}
      onCancelEdit={editor.cancel}
      onCancelDelete={() => setDeletingTask(null)}
      startingWorktree={startingTask?.id === task.id}
      onCancelWorktree={closeWorktreePrompt}
      worktreeBranch={taskWorktrees.linkOf(task.id)?.branch}
    >
      {startingTask?.id === task.id ? (
        <StartWorktreePopover
          repos={repos.repos}
          repoPath={worktreeRepo}
          onPickRepo={setWorktreeRepo}
          branch={worktreeBranch}
          onBranchChange={setWorktreeBranch}
          aiBrief={aiEnabled}
          starting={taskWorktrees.starting}
          error={taskWorktrees.error}
        />
      ) : (
        <TaskEditor editor={editor} error={error} groups={taskGroups.groups} />
      )}
    </TaskRow>
  );

  return (
    <>
      {archiveOpen ? (
        <ArchivePage archive={archive} totalCount={archived.length} renderRow={renderRow} />
      ) : (
        <>
          <GroupFilterBar view={taskGroups} />
          <Section title="Inbox" count={open.length}>
            {open.length === 0 ? (
              <EmptyState icon={Inbox}>
                {recentCompleted.length + archived.length > 0
                  ? 'Inbox zero — all caught up.'
                  : 'No tasks yet — capture one from anywhere, or move one over from Incoming.'}
              </EmptyState>
            ) : (
              <ul className="space-y-2">{open.map(renderRow)}</ul>
            )}
            {/* The editor shows its own error; don't repeat it under the list. */}
            {error && !editor.task && (
              <div className="mt-2">
                <ErrorLine>{error}</ErrorLine>
              </div>
            )}
          </Section>

          {recentCompleted.length > 0 && (
            <Section title="Completed" count={recentCompleted.length}>
              <ul className="space-y-2">{recentCompleted.map(renderRow)}</ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}
