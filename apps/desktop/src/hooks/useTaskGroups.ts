import { useEffect, useState } from 'react';
import type { TaskGroup } from '@/generated/TaskGroup';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

export type GroupPrompt = 'create' | 'edit';

export interface TaskGroupsView {
  groups: TaskGroup[];
  /** The active filter — `null` means All. */
  selectedId: string | null;
  selected: TaskGroup | null;
  select: (id: string | null) => void;
  /** Step the filter through All + the groups (wraps). Bound to `←→`/`hl` in TaskList. */
  cycle: (delta: number) => void;
  /** The open prompt (create a group, or edit the selected group's name + context), or
   *  `null` when closed. */
  prompt: GroupPrompt | null;
  closePrompt: () => void;
  submitPrompt: (name: string, context?: string) => Promise<void>;
  /** True while the delete-confirm popover is open. */
  deleting: boolean;
  /** Open the delete-confirm for the selected group (bound to `⌫` in TaskList, so it can
   *  be gated on no task being focused — same key as deleting a task). */
  requestDelete: () => void;
  cancelDelete: () => void;
  /** True while the name prompt or the delete dialog owns the keyboard. */
  busy: boolean;
  error: string;
}

interface Options {
  /** False while another overlay (editor, task-delete dialog) owns the keyboard. */
  enabled: boolean;
  /** False on the archive page — the filter bar is hidden there, so its management keys
   *  (`n`/`r`) must stand down. */
  canManage: boolean;
}

/**
 * The inbox's group filter: the list of groups, the selected one (persisted as the
 * `active_task_group` setting so capture windows default to it), and the keyboard-only
 * management flows — `n` creates, `r` edits (name + context), `⌫` deletes (`⌘↵` confirms). Deleting is
 * bound in TaskList (via `requestDelete`) because it shares the `⌫` key with task delete
 * and must stand down when a task is focused. Filter cycling (`←→`/`hl`) is likewise bound
 * in TaskList. Deleting a group un-groups its tasks.
 */
export function useTaskGroups({ enabled, canManage }: Options): TaskGroupsView {
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

  const submitPrompt = async (name: string, context?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      closePrompt();
      return;
    }
    try {
      if (prompt === 'edit' && selected) {
        const patch: { name?: string; context?: string } = {};
        if (trimmedName !== selected.name) patch.name = trimmedName;
        const nextContext = (context ?? '').trim();
        if (nextContext !== (selected.context ?? '')) patch.context = nextContext;
        if (Object.keys(patch).length > 0) await api.updateTaskGroup(selected.id, patch);
      } else {
        await api.createTaskGroup({ name: trimmedName, context: (context ?? '').trim() || null });
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
  const manage = enabled && canManage && !busy;
  useShortcut('group.new', { enabled: manage, callback: () => setPrompt('create') });
  useShortcut('group.rename', {
    enabled: manage && selected !== null,
    callback: () => setPrompt('edit'),
  });
  // group.delete is bound in TaskList (needs focus to disambiguate from task delete).
  // The confirm popover has no buttons — ⌘↵ confirms; Esc (also Radix's backdrop) cancels.
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
    requestDelete: () => setDeleting(true),
    cancelDelete,
    busy,
    error,
  };
}
