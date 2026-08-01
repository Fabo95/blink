import { Inbox } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ArchiveSection } from '@/components/tasks/ArchiveSection';
import { DeleteTaskDialog } from '@/components/tasks/DeleteTaskDialog';
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
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  const [error, setError] = useState('');
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(true);
  const report = (e: unknown, fallback: string) => setError(errorMessage(e, fallback));

  const editor = useTaskEditor({ onSaved: onChanged, setError });
  const isEditing = editor.task !== null;
  // The browsing shortcuts are enabled exactly while no overlay (editor, delete dialogs,
  // group prompt) owns the keyboard — each overlay's own shortcuts enable on its state.
  const baseEnabled = !isEditing && deletingTask === null;
  const taskGroups = useTaskGroups({ enabled: baseEnabled });
  const enabled = baseEnabled && !taskGroups.busy;

  // Filtering before the split keeps every section (and its count) on the same filter.
  const visible =
    taskGroups.selectedId === null
      ? tasks
      : tasks.filter((t) => t.taskGroupId === taskGroups.selectedId);
  const { active, recentCompleted, archived } = splitTasks(visible);
  const groupNames = new Map(taskGroups.groups.map((g) => [g.id, g.name]));
  const archive = useArchive(archived, { enabled });

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

  // One cursor over everything currently visible — each collapsed section drops out, so
  // the cursor never lands on a hidden row.
  const navItems = [
    ...(inboxOpen ? active : []),
    ...(completedOpen ? recentCompleted : []),
    ...(archive.open ? archive.items : []),
  ];
  const {
    focusedId,
    setFocusedId,
    focused: focusedTask,
    advance,
  } = useListCursor(navItems, (t) => t.id, { enabled });

  // The focused row's actions — enabled here (not in the cursor) because their gates
  // and dynamic labels need the task's data.
  const focusedEnabled = enabled && focusedTask !== null;
  useShortcut('task.toggle', {
    hint: { keys: '↵', label: focusedTask?.status === 'done' ? 'restore' : 'complete' },
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
  useShortcut('task.delete', {
    enabled: focusedEnabled,
    callback: () => {
      if (focusedTask) setDeletingTask(focusedTask);
    },
  });
  const reorderable = focusedEnabled && inboxOpen && active.some((t) => t.id === focusedTask?.id);
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

  // One horizontal axis, arrows + vim like ↑↓/jk: while the archive is open its pager
  // owns ←→/hl (enabled in useArchive), otherwise they cycle the group filter.
  const canCycleGroups = enabled && !archive.open && taskGroups.groups.length > 0;
  useShortcut('filter.prev', { enabled: canCycleGroups, callback: () => taskGroups.cycle(-1) });
  useShortcut('filter.next', { enabled: canCycleGroups, callback: () => taskGroups.cycle(1) });

  // Section toggles are surfaced by the header chips. `i` belongs to the cursor's edit
  // action, vim-style, hence `b` for the Inbox.
  useShortcut('section.inbox', { enabled, callback: () => setInboxOpen((o) => !o) });
  useShortcut('section.completed', {
    enabled: enabled && recentCompleted.length > 0,
    callback: () => setCompletedOpen((o) => !o),
  });
  // `v` flips every hint chip between the standard keys and their vim synonyms — always
  // on, surfaced by the footer's own toggle chip.
  useShortcut('app.hintDialect', { callback: toggleHintStyle });
  // The list is driven by the cursor, not DOM focus — while browsing, Tab would just
  // throw a stray focus ring around, so swallow it (preventDefault is the whole action).
  useShortcut('browse.swallowTab', { enabled: !isEditing, callback: () => {} });

  // Keep the focused row in view as the cursor moves (`nearest` scrolls the minimum).
  useEffect(() => {
    if (!focusedId) return;
    document.querySelector(`[data-task-id="${focusedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

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
      groupName={
        // Redundant while a group filter is active — every visible row shares it.
        taskGroups.selectedId === null && task.taskGroupId
          ? groupNames.get(task.taskGroupId)
          : undefined
      }
      onSelect={(t) => setFocusedId(t.id)}
      onToggleComplete={toggleComplete}
      onOpenLink={openLink}
      onCancelEdit={editor.cancel}
    >
      <TaskEditor editor={editor} error={error} groups={taskGroups.groups} />
    </TaskRow>
  );

  return (
    <>
      <GroupFilterBar view={taskGroups} />
      <TaskSection
        title="Inbox"
        toggleKey="b"
        open={inboxOpen}
        onToggle={() => setInboxOpen((o) => !o)}
        count={active.length}
      >
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
        <TaskSection
          title="Completed"
          toggleKey="c"
          open={completedOpen}
          onToggle={() => setCompletedOpen((o) => !o)}
          count={recentCompleted.length}
        >
          <ul className="space-y-2">{recentCompleted.map(renderRow)}</ul>
        </TaskSection>
      )}

      {archived.length > 0 && (
        <ArchiveSection archive={archive} totalCount={archived.length} renderRow={renderRow} />
      )}

      <DeleteTaskDialog
        task={deletingTask}
        onOpenChange={(open) => !open && setDeletingTask(null)}
      />
    </>
  );
}
