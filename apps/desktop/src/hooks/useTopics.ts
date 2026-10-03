import { useEffect, useState } from 'react';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { Topic } from '@/generated/Topic';
import type { TopicStatus } from '@/generated/TopicStatus';
import { api, isTauri } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

export type TopicPrompt = 'create' | 'edit';

export interface TopicFields {
  name: string;
  question: string;
  status: TopicStatus;
  sensitivity: Sensitivity;
}

export interface TopicsView {
  topics: Topic[];
  /** The active filter; `null` means All. */
  selectedId: string | null;
  selected: Topic | null;
  select: (id: string | null) => void;
  /** Step the filter through All + the topics (wraps). Bound to `←→`/`hl` in IdeasPage. */
  cycle: (delta: number) => void;
  prompt: TopicPrompt | null;
  closePrompt: () => void;
  submitPrompt: (fields: TopicFields) => Promise<void>;
  deleting: boolean;
  /** Open the delete confirm for the selected topic (bound to `⌫` in IdeasPage, gated on no
   *  note being focused, the same key as deleting a note). */
  requestDelete: () => void;
  cancelDelete: () => void;
  /** True while the prompt or the delete confirm owns the keyboard. */
  busy: boolean;
  error: string;
}

interface Options {
  /** False while another overlay owns the keyboard. */
  enabled: boolean;
  /** Re-read the notes after a delete moved or removed some. */
  onNotesChanged: () => void;
}

/**
 * The Ideas page's topic filter and the keyboard-only topic management, mirroring
 * `useTaskGroups`: `n` creates, `r` edits (name, question, status, sensitivity), `⌫` deletes
 * with a choice between keeping the notes (`⌘↵`) and deleting them too (`⌘⌫`). The filter
 * persists as the `active_topic` setting so the capture windows default to it.
 */
export function useTopics({ enabled, onNotesChanged }: Options): TopicsView {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<TopicPrompt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const selected = topics.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    void (async () => {
      const [loaded, active] = await Promise.all([api.listTopics(), api.getActiveTopic()]);
      setTopics(loaded);
      setSelectedId(loaded.some((t) => t.id === active) ? active : null);
    })();
  }, []);

  const refresh = async () => setTopics(await api.listTopics());

  // A pull can create topics too (another device), so re-read rather than trust the
  // mount-time load.
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let active = true;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen('records-merged', () => {
        void api.listTopics().then(setTopics);
      }).then((fn) => {
        if (active) unlisten = fn;
        else fn();
      }),
    );
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const select = (id: string | null) => {
    setSelectedId(id);
    // Fire-and-forget: the setting only feeds the capture windows' default.
    void api.setActiveTopic(id);
  };

  const cycle = (delta: number) => {
    const order: (string | null)[] = [null, ...topics.map((t) => t.id)];
    const idx = order.indexOf(selectedId);
    select(order[(idx + delta + order.length) % order.length] ?? null);
  };

  const closePrompt = () => {
    setPrompt(null);
    setError('');
  };

  const submitPrompt = async (fields: TopicFields) => {
    const name = fields.name.trim();
    if (!name) {
      closePrompt();
      return;
    }
    const question = fields.question.trim();
    try {
      if (prompt === 'edit' && selected) {
        const patch: {
          name?: string;
          question?: string;
          status?: TopicStatus;
          sensitivity?: Sensitivity;
        } = {};
        if (name !== selected.name) patch.name = name;
        if (question !== (selected.question ?? '')) patch.question = question;
        if (fields.status !== selected.status) patch.status = fields.status;
        if (fields.sensitivity !== selected.sensitivity) patch.sensitivity = fields.sensitivity;
        if (Object.keys(patch).length > 0) await api.updateTopic(selected.id, patch);
      } else {
        const created = await api.createTopic({
          name,
          question: question || null,
          sensitivity: fields.sensitivity,
        });
        // A new topic is where the user wants to work next.
        select(created.id);
      }
      closePrompt();
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not save topic'));
    }
  };

  const cancelDelete = () => setDeleting(false);

  const confirmDelete = async (deleteNotes: boolean) => {
    if (!selected) return;
    setDeleting(false);
    try {
      await api.deleteTopic(selected.id, deleteNotes);
      select(null);
      await refresh();
      onNotesChanged();
    } catch (e) {
      setError(errorMessage(e, 'Could not delete topic'));
    }
  };

  const busy = prompt !== null || deleting;
  const manage = enabled && !busy;
  useShortcut('topic.new', { enabled: manage, callback: () => setPrompt('create') });
  useShortcut('topic.edit', {
    enabled: manage && selected !== null,
    callback: () => setPrompt('edit'),
  });
  useShortcut('topicDelete.unfile', {
    enabled: deleting,
    callback: () => void confirmDelete(false),
  });
  useShortcut('topicDelete.withNotes', {
    enabled: deleting,
    callback: () => void confirmDelete(true),
  });
  useShortcut('topicDelete.cancel', { enabled: deleting, callback: cancelDelete });

  return {
    topics,
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
