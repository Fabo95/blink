import { Inbox } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CaptureCard } from '@/components/CaptureCard';
import { ArchivePage } from '@/components/tasks/ArchivePage';
import { GroupFilterBar } from '@/components/tasks/GroupFilterBar';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { TaskRow } from '@/components/tasks/TaskRow';
import { TaskSection } from '@/components/tasks/TaskSection';
import type { Task } from '@/generated/Task';
import { useArchive } from '@/hooks/useArchive';
import { useListCursor } from '@/hooks/useListCursor';
import { useTaskEditor } from '@/hooks/useTaskEditor';
import { useTaskGroups } from '@/hooks/useTaskGroups';
import { api } from '@/lib/api';
import { splitTasks } from '@/lib/completed';
import { toggleHintStyle } from '@/lib/hintStyle';
import { ShortcutHelp } from '@/lib/shortcuts/ShortcutHelp';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  const [error, setError] = useState('');
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // The `p` prompt action for a single row: `loading` while generating, `copied` for a
  // brief confirmation. The copied state auto-clears via the ref'd timeout below.
  const [promptState, setPromptState] = useState<{ id: string; status: 'loading' | 'copied' } | null>(
    null,
  );
  const promptResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The Archive is its own page, reached with `a` — while it's open the inbox (capture card,
  // filter bar, Inbox/Completed) is replaced by the archive view. Lifted here (above the two
  // hooks that read it) so both the group filter and the archive derivation stay in sync.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const report = (e: unknown, fallback: string) => setError(errorMessage(e, fallback));

  const editor = useTaskEditor({ onSaved: onChanged, setError });
  const isEditing = editor.task !== null;
  // The browsing shortcuts are enabled exactly while no overlay (editor, delete dialogs,
  // group prompt, help sheet) owns the keyboard — each overlay's own shortcuts enable on
  // its state.
  const baseEnabled = !isEditing && deletingTask === null && !helpOpen;
  const taskGroups = useTaskGroups({ enabled: baseEnabled, canManage: !archiveOpen });
  const enabled = baseEnabled && !taskGroups.busy;

  // Filtering before the split keeps every section (and its count) on the same filter.
  const visible =
    taskGroups.selectedId === null
      ? tasks
      : tasks.filter((t) => t.taskGroupId === taskGroups.selectedId);
  const { active, recentCompleted, archived } = splitTasks(visible);
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

  // Reordering is inbox-only: swap the focused active task with its neighbour above/below.
  const moveActive = async (task: Task, delta: -1 | 1) => {
    const idx = active.findIndex((t) => t.id === task.id);
    const neighbour = idx === -1 ? undefined : active[idx + delta];
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
  const navItems = archiveOpen ? archive.items : [...active, ...recentCompleted];
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
    enabled: focusedEnabled,
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
  const reorderable = focusedEnabled && active.some((t) => t.id === focusedTask?.id);
  useShortcut('task.moveUp', {
    enabled: reorderable,
    callback: () => {
      if (focusedTask) void moveActive(focusedTask, -1);
    },
  });
  useShortcut('task.moveDown', {
    enabled: reorderable,
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

  // `v` flips every hint chip between the standard keys and their vim synonyms — always
  // on, surfaced by the footer's own toggle chip.
  useShortcut('app.hintDialect', { callback: toggleHintStyle });
  // `c` toggles the cheat-sheet. Enabled independent of `helpOpen` so it also closes it;
  // gated off during the editor/delete overlays so `c` types normally in their fields.
  useShortcut('app.help', {
    enabled: !isEditing && deletingTask === null,
    callback: () => setHelpOpen((o) => !o),
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
    >
      <TaskEditor editor={editor} error={error} groups={taskGroups.groups} />
    </TaskRow>
  );

  return (
    <>
      {archiveOpen ? (
        <ArchivePage archive={archive} totalCount={archived.length} renderRow={renderRow} />
      ) : (
        <>
          <CaptureCard />
          <GroupFilterBar view={taskGroups} />
          <TaskSection title="Inbox" count={active.length}>
            {active.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <Inbox className="size-6" />
                <p className="text-sm">
                  {recentCompleted.length + archived.length > 0
                    ? 'Inbox zero — all caught up.'
                    : 'No tasks yet — capture something above.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">{active.map(renderRow)}</ul>
            )}
            {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
          </TaskSection>

          {recentCompleted.length > 0 && (
            <TaskSection title="Completed" count={recentCompleted.length}>
              <ul className="space-y-2">{recentCompleted.map(renderRow)}</ul>
            </TaskSection>
          )}
        </>
      )}

      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
