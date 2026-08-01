import { useEffect, useState } from 'react';
import type { TaskGroup } from '@/generated/TaskGroup';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

export type GroupPrompt = 'create' | 'rename';

export interface TaskGroupsView {
  groups: TaskGroup[];
  /** The active filter — `null` means All. */
  selectedId: string | null;
  selected: TaskGroup | null;
  select: (id: string | null) => void;
  /** Step the filter through All + the groups (wraps). Bound to `←→`/`hl` in TaskList. */
  cycle: (delta: number) => void;
  /** The open name prompt (create or rename), or `null` when closed. */
  prompt: GroupPrompt | null;
  closePrompt: () => void;
  submitPrompt: (name: string) => Promise<void>;
  /** True while the delete-confirm dialog is open. */
  deleting: boolean;
  cancelDelete: () => void;
  /** True while the name prompt or the delete dialog owns the keyboard. */
  busy: boolean;
  error: string;
}

interface Options {
  /** False while another overlay (editor, task-delete dialog) owns the keyboard. */
  enabled: boolean;
}

/**
 * The inbox's group filter: the list of groups, the selected one (persisted as the
 * `active_task_group` setting so capture windows default to it), and the keyboard-only
 * management flows — `n` creates, `r` renames, `⌘⌫` deletes (`⌘↵` confirms). Filter
 * cycling (`←→`/`hl`) is exposed as `cycle` and enabled in TaskList, which knows when the
 * archive pager owns those keys. Deleting a group un-groups its tasks.
 */
export function useTaskGroups({ enabled }: Options): TaskGroupsView {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<GroupPrompt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  // The filter persists across restarts; ignore a stale id whose group is gone.
  useEffect(() => {
    void (async () => {
      const [loaded, active] = await Promise.all([api.listTaskGroups(), api.getActiveTaskGroup()]);
      setGroups(loaded);
      setSelectedId(loaded.some((g) => g.id === active) ? active : null);
    })();
  }, []);

  const refresh = async () => setGroups(await api.listTaskGroups());

  const select = (id: string | null) => {
    setSelectedId(id);
    // Fire-and-forget: the setting only feeds the capture windows' default.
    void api.setActiveTaskGroup(id);
  };

  const cycle = (delta: number) => {
    const order: (string | null)[] = [null, ...groups.map((g) => g.id)];
    const idx = order.indexOf(selectedId);
    const next = order[(idx + delta + order.length) % order.length];
    select(next ?? null);
  };

  const closePrompt = () => {
    setPrompt(null);
    setError('');
  };

  const submitPrompt = async (name: string) => {
    if (!name.trim()) {
      closePrompt();
      return;
    }
    try {
      if (prompt === 'rename' && selected) {
        await api.renameTaskGroup(selected.id, name);
      } else {
        await api.createTaskGroup(name);
      }
      closePrompt();
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not save group'));
    }
  };

  const cancelDelete = () => setDeleting(false);

  const confirmDelete = async () => {
    if (!selected) return;
    setDeleting(false);
    try {
      await api.deleteTaskGroup(selected.id);
      select(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not delete group'));
    }
  };

  // Management keys stand down while any overlay — including this hook's own prompt and
  // delete dialog — owns the keyboard.
  const busy = prompt !== null || deleting;
  const manage = enabled && !busy;
  useShortcut('group.new', { enabled: manage, callback: () => setPrompt('create') });
  useShortcut('group.rename', {
    enabled: manage && selected !== null,
    callback: () => setPrompt('rename'),
  });
  useShortcut('group.delete', {
    enabled: manage && selected !== null,
    callback: () => setDeleting(true),
  });
  // The confirm dialog has no buttons — ⌘↵ confirms; Esc (also Radix's backdrop) cancels.
  useShortcut('groupDelete.confirm', {
    enabled: deleting,
    callback: () => void confirmDelete(),
  });
  useShortcut('groupDelete.cancel', { enabled: deleting, callback: cancelDelete });

  return {
    groups,
    selectedId,
    selected,
    select,
    cycle,
    prompt,
    closePrompt,
    submitPrompt,
    deleting,
    cancelDelete,
    busy,
    error,
  };
}
