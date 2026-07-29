import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { TaskGroup } from '@/generated/TaskGroup';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export type GroupPrompt = 'create' | 'rename';

export interface TaskGroupsView {
  groups: TaskGroup[];
  /** The active filter — `null` means All. */
  selectedId: string | null;
  selected: TaskGroup | null;
  select: (id: string | null) => void;
  /** The open name prompt (create or rename), or `null` when closed. */
  prompt: GroupPrompt | null;
  closePrompt: () => void;
  submitPrompt: (name: string) => Promise<void>;
  /** True while the delete-confirm dialog is open. */
  deleting: boolean;
  cancelDelete: () => void;
  /** True while a prompt or the delete dialog owns the keyboard. */
  busy: boolean;
  error: string;
}

interface Options {
  /** Gate the keyboard shortcuts while an editor or modal owns the keys. */
  interactive: boolean;
}

/**
 * The inbox's group filter: the list of groups, the selected one (persisted as the
 * `active_task_group` setting so capture windows default to it), and the keyboard-only
 * management flows — `h`/`l` cycle the filter, `n` creates, `r` renames, `⌘⌫` deletes
 * (⏎ confirms). Deleting a group un-groups its tasks, so no data is lost.
 */
export function useTaskGroups({ interactive }: Options): TaskGroupsView {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<GroupPrompt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const busy = prompt !== null || deleting;
  // The hook's own overlays suspend its shortcuts too, not just the parent's.
  const enabled = interactive && !busy;

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

  useHotkeys('h', () => cycle(-1), { enabled: enabled && groups.length > 0 });
  useHotkeys('l', () => cycle(1), { enabled: enabled && groups.length > 0 });
  useHotkeys('n', () => setPrompt('create'), { enabled, preventDefault: true });
  useHotkeys('r', () => setPrompt('rename'), { enabled: enabled && selected !== null });
  useHotkeys('mod+backspace', () => setDeleting(true), {
    enabled: enabled && selected !== null,
    preventDefault: true,
  });
  // The confirm dialog has no buttons — ⌘↵ confirms (Esc/backdrop cancel via Radix).
  useHotkeys('mod+enter', () => void confirmDelete(), {
    enabled: interactive && deleting,
    preventDefault: true,
  });

  return {
    groups,
    selectedId,
    selected,
    select,
    prompt,
    closePrompt,
    submitPrompt,
    deleting,
    cancelDelete,
    busy,
    error,
  };
}
