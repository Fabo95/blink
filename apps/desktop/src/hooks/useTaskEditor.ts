import { useState } from 'react';
import type { Task } from '@/generated/Task';
import { api } from '@/lib/api';
import { normalizeLink } from '@/lib/link';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

export interface TaskEditor {
  /** The task currently being edited, or `null` when the editor is closed. */
  task: Task | null;
  isEditing: (id: string) => boolean;
  draft: string;
  link: string;
  source: string;
  /** The draft's group id, or `null` for no group. */
  taskGroupId: string | null;
  /** True while the draft holds AI-improved text (gates ⌘I to once per version). */
  improved: boolean;
  improving: boolean;
  /** Editing the text manually invalidates the improved flag. */
  setDraft: (value: string) => void;
  setLink: (value: string) => void;
  setSource: (value: string) => void;
  setTaskGroupId: (value: string | null) => void;
  start: (task: Task) => void;
  cancel: () => void;
}

interface Options {
  onSaved: () => void;
  setError: (message: string) => void;
}

// Native Tab moves between the editor's fields (`data-editor-field`); intercept only at
// the ends to wrap, so focus stays inside the popover — Radix Popover doesn't trap it.
function wrapEditorFields(e: KeyboardEvent) {
  const fields = Array.from(document.querySelectorAll<HTMLElement>('[data-editor-field]'));
  const first = fields[0];
  const last = fields[fields.length - 1];
  if (fields.length < 2 || first === undefined || last === undefined) return;
  if (!e.shiftKey && e.target === last) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && e.target === first) {
    e.preventDefault();
    last.focus();
  }
}

/**
 * The in-row task editor's state machine: draft fields, the once-per-version AI-improve
 * flag, and the editor scope's commands (`⇥` field-wrap / `⌘i` / `⌘↵` / `Esc`). Saving
 * sends only the fields that actually changed; an empty edit or link just cancels/clears.
 */
export function useTaskEditor({ onSaved, setError }: Options): TaskEditor {
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraftText] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState('');
  const [taskGroupId, setTaskGroupId] = useState<string | null>(null);
  const [improved, setImproved] = useState(false);
  const [improving, setImproving] = useState(false);

  const start = (next: Task) => {
    setTask(next);
    setDraftText(next.text);
    setLink(next.link ?? '');
    setSource(next.source.appName || next.source.appId);
    setTaskGroupId(next.taskGroupId);
    setImproved(next.improved);
    setError('');
  };

  const cancel = () => {
    setTask(null);
    setDraftText('');
    setLink('');
    setSource('');
    setTaskGroupId(null);
    setImproved(false);
  };

  const setDraft = (value: string) => {
    setDraftText(value);
    setImproved(false);
  };

  const save = async () => {
    if (!task) return;
    const text = draft.trim();
    if (!text) {
      cancel();
      return;
    }
    const patch: {
      text?: string;
      link?: string;
      source?: string;
      improved?: boolean;
      taskGroupId?: string;
    } = {};
    if (text !== task.text) patch.text = text;
    const nextLink = normalizeLink(link) ?? '';
    if (nextLink !== (task.link ?? '')) patch.link = nextLink;
    const nextSource = source.trim();
    if (nextSource !== (task.source.appName || task.source.appId)) patch.source = nextSource;
    if (improved !== task.improved) patch.improved = improved;
    // Empty string clears the group server-side (the link pattern).
    if ((taskGroupId ?? '') !== (task.taskGroupId ?? '')) patch.taskGroupId = taskGroupId ?? '';

    if (Object.keys(patch).length === 0) {
      cancel();
      return;
    }
    try {
      await api.updateTask(task.id, patch);
      cancel();
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Could not save edit'));
    }
  };

  const improve = async () => {
    const text = draft.trim();
    if (!text || improved) return;
    setImproving(true);
    setError('');
    try {
      setDraftText(await api.improveText(text));
      setImproved(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not improve text'));
    } finally {
      setImproving(false);
    }
  };

  useShortcut('editor.field', { enabled: task !== null, callback: wrapEditorFields });
  useShortcut('editor.improve', {
    enabled: task !== null && !improved,
    callback: () => void improve(),
  });
  useShortcut('editor.save', { enabled: task !== null, callback: () => void save() });
  useShortcut('editor.cancel', {
    enabled: task !== null,
    callback: (e) => {
      // Esc inside the open group-picker menu closes the menu (Radix); only a bare Esc
      // cancels the editor.
      const target = e.target;
      if (target instanceof HTMLElement && target.closest('[role="menu"]')) return;
      cancel();
    },
  });

  return {
    task,
    isEditing: (id) => task?.id === id,
    draft,
    link,
    source,
    taskGroupId,
    improved,
    improving,
    setDraft,
    setLink,
    setSource,
    setTaskGroupId,
    start,
    cancel,
  };
}
