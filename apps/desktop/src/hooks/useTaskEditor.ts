import { useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { Task } from '@/generated/Task';
import { api } from '@/lib/api';
import { normalizeLink } from '@/lib/link';
import { errorMessage } from '@/lib/utils';

export interface TaskEditor {
  /** The task currently being edited, or `null` when the editor is closed. */
  task: Task | null;
  isEditing: (id: string) => boolean;
  draft: string;
  link: string;
  source: string;
  /** True while the draft holds AI-improved text (gates ⌘I to once per version). */
  improved: boolean;
  improving: boolean;
  /** Editing the text manually invalidates the improved flag. */
  setDraft: (value: string) => void;
  setLink: (value: string) => void;
  setSource: (value: string) => void;
  start: (task: Task) => void;
  cancel: () => void;
}

interface Options {
  onSaved: () => void;
  setError: (message: string) => void;
}

/**
 * The in-row task editor's state machine: draft fields, the once-per-version AI-improve
 * flag, and the `⌘I` / `⌘↵` keys (bound here so they fire from inside the fields). Saving
 * sends only the fields that actually changed; an empty edit or link just cancels/clears.
 */
export function useTaskEditor({ onSaved, setError }: Options): TaskEditor {
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraftText] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState('');
  const [improved, setImproved] = useState(false);
  const [improving, setImproving] = useState(false);

  const start = (next: Task) => {
    setTask(next);
    setDraftText(next.text);
    setLink(next.link ?? '');
    setSource(next.source.appName || next.source.appId);
    setImproved(next.improved);
    setError('');
  };

  const cancel = () => {
    setTask(null);
    setDraftText('');
    setLink('');
    setSource('');
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
    const patch: { text?: string; link?: string; source?: string; improved?: boolean } = {};
    if (text !== task.text) patch.text = text;
    const nextLink = normalizeLink(link) ?? '';
    if (nextLink !== (task.link ?? '')) patch.link = nextLink;
    const nextSource = source.trim();
    if (nextSource !== (task.source.appName || task.source.appId)) patch.source = nextSource;
    if (improved !== task.improved) patch.improved = improved;

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

  useHotkeys('mod+i', () => void improve(), {
    enabled: task !== null && !improved,
    enableOnFormTags: true,
    preventDefault: true,
  });
  useHotkeys('mod+enter', () => void save(), {
    enabled: task !== null,
    enableOnFormTags: true,
    preventDefault: true,
  });

  return {
    task,
    isEditing: (id) => task?.id === id,
    draft,
    link,
    source,
    improved,
    improving,
    setDraft,
    setLink,
    setSource,
    start,
    cancel,
  };
}
