import { Inbox } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { ArchiveSection } from '@/components/tasks/ArchiveSection';
import { DeleteTaskDialog } from '@/components/tasks/DeleteTaskDialog';
import { GroupFilterBar } from '@/components/tasks/GroupFilterBar';
import { COMPLETED_SHORTCUTS, INBOX_SHORTCUTS } from '@/components/tasks/hints';
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
  // The editor popover and the delete modal each own the keyboard while open, so the
  // group shortcuts (and, below, the list cursor) stand down.
  const baseInteractive = !isEditing && deletingTask === null;
  const taskGroups = useTaskGroups({ interactive: baseInteractive });

  // Filtering before the split keeps every section (and its count) on the same filter.
  const visible =
    taskGroups.selectedId === null
      ? tasks
      : tasks.filter((t) => t.taskGroupId === taskGroups.selectedId);
  const { active, recentCompleted, archived } = splitTasks(visible);
  const groupNames = new Map(taskGroups.groups.map((g) => [g.id, g.name]));

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
  // Completed/archived rows aren't in `active`, so this is a no-op there.
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

  // The group name-prompt / delete dialog own the keyboard too.
  const interactive = baseInteractive && !taskGroups.busy;
  const archive = useArchive(archived, { interactive });

  // One cursor over everything currently visible — each collapsed section drops out, so
  // the cursor never lands on a hidden row. ⏎ completes an active task or restores a done one.
  const navItems = [
    ...(inboxOpen ? active : []),
    ...(completedOpen ? recentCompleted : []),
    ...(archive.open ? archive.items : []),
  ];
  const { focusedId, setFocusedId } = useListCursor(navItems, (t) => t.id, {
    onEnter: toggleComplete,
    onEdit: editor.start,
    onDelete: setDeletingTask,
    onOpenLink: openLink,
    onMoveUp: (t) => void moveActive(t, -1),
    onMoveDown: (t) => void moveActive(t, 1),
    disabled: !interactive,
  });

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
  // The delete modal has no buttons — ⌘↵ confirms (Esc/backdrop cancel via Radix).
  useHotkeys('mod+enter', () => void confirmDelete(), {
    enabled: deletingTask !== null,
    preventDefault: true,
  });

  // `i` / `c` collapse the Inbox / Completed sections (archive's `a` lives in useArchive).
  useHotkeys('i', () => setInboxOpen((o) => !o), { enabled: interactive });
  useHotkeys('c', () => setCompletedOpen((o) => !o), {
    enabled: interactive && recentCompleted.length > 0,
  });

  // Tab is only useful inside the editor (to move between its fields). Elsewhere the list is
  // driven by the cursor, not DOM focus, so Tab would just throw a stray focus ring around.
  // While not editing, make Tab do nothing.
  useHotkeys('tab, shift+tab', (e) => e.preventDefault(), {
    enabled: !isEditing,
    enableOnFormTags: true,
    preventDefault: true,
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
        toggleKey="i"
        open={inboxOpen}
        onToggle={() => setInboxOpen((o) => !o)}
        count={active.length}
        shortcuts={INBOX_SHORTCUTS}
        showShortcuts={active.length > 0}
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
          shortcuts={COMPLETED_SHORTCUTS}
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
