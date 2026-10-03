import { Lightbulb, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DeleteNotePopover } from '@/components/ideas/DeleteNotePopover';
import { HistoryPopover } from '@/components/ideas/HistoryPopover';
import { LinkPopover } from '@/components/ideas/LinkPopover';
import { NoteEditor } from '@/components/ideas/NoteEditor';
import { NoteRow } from '@/components/ideas/NoteRow';
import { NoteSection } from '@/components/ideas/NoteSection';
import { ReviewPopover } from '@/components/ideas/ReviewPopover';
import { TopicFilterBar } from '@/components/ideas/TopicFilterBar';
import { TopicHeader } from '@/components/ideas/TopicHeader';
import { Input } from '@/components/ui/input';
import type { ExportFormat } from '@/generated/ExportFormat';
import type { Note } from '@/generated/Note';
import { useDueNotes } from '@/hooks/useDueNotes';
import { useLinkPicker } from '@/hooks/useLinkPicker';
import { useListCursor } from '@/hooks/useListCursor';
import { useNoteEditor } from '@/hooks/useNoteEditor';
import { useNoteHistory } from '@/hooks/useNoteHistory';
import { useNoteSearch } from '@/hooks/useNoteSearch';
import { useNotes } from '@/hooks/useNotes';
import { useReview } from '@/hooks/useReview';
import { useTopics } from '@/hooks/useTopics';
import { api } from '@/lib/api';
import { cycleNext, NOTE_TYPE_LABEL, NOTE_TYPES, splitNotes } from '@/lib/notes';
import { display } from '@/lib/shortcut';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { errorMessage } from '@/lib/utils';

/**
 * The Ideas page: notes due for review first, then the rest grouped by type under a topic
 * filter, with full-text search, in-row review / editing / history, and export. A thin
 * orchestrator like `TaskList`: it owns the cursor and the row overlays; topics, search,
 * review, editing, and history live in hooks. `onChanged` tells the shell that reviews or a
 * promotion changed what it shows (the due badge, the inbox).
 */
export function IdeasPage({
  onChanged,
  helpOpen,
}: {
  onChanged: () => void;
  /** The shell's cheat-sheet is open: the page's keys stand down. */
  helpOpen: boolean;
}) {
  const { notes, refresh } = useNotes();
  const { due, refresh: refreshDue } = useDueNotes({ version: notes });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [ideaShortcut, setIdeaShortcut] = useState('');
  const report = (e: unknown, fallback: string) => setError(errorMessage(e, fallback));

  const editor = useNoteEditor({ onSaved: refresh, setError });
  const history = useNoteHistory({ onRestored: refresh, setError });
  const review = useReview({
    onReviewed: async (outcome) => {
      await Promise.all([refresh(), refreshDue()]);
      onChanged();
      if (outcome.task) setNotice(`Added to the inbox: ${outcome.task.text}`);
    },
  });

  const picker = useLinkPicker({
    notes,
    onChanged: () => {
      void refresh();
      void refreshDue();
    },
  });

  const isEditing = editor.note !== null;
  const baseEnabled =
    !isEditing &&
    !history.note &&
    !review.current &&
    !picker.note &&
    deletingNote === null &&
    !helpOpen;
  const topics = useTopics({ enabled: baseEnabled, onNotesChanged: refresh });
  const enabled = baseEnabled && !topics.busy;
  const search = useNoteSearch({ enabled, version: notes });

  useEffect(() => {
    api
      .getCaptureShortcut('idea')
      .then(setIdeaShortcut)
      .catch(() => {});
  }, []);

  const inTopic = (note: Note) => topics.selectedId === null || note.topicId === topics.selectedId;
  const visible = (search.results ?? notes).filter(inTopic);
  const dueVisible = due.filter(inTopic);
  const dueIds = new Set(dueVisible.map((n) => n.id));
  // Due notes show once, in their own section on top. Dropped notes leave the sections but
  // stay findable through search.
  const browsing = visible.filter((n) => !dueIds.has(n.id) && n.status !== 'dropped');
  const sections = search.results
    ? [{ key: 'results', title: 'Results', notes: visible }]
    : [
        { key: 'due', title: 'Due for review', notes: dueVisible },
        ...NOTE_TYPES.map((type) => ({
          key: type,
          title: NOTE_TYPE_LABEL[type].many,
          notes: splitNotes(browsing)[type],
        })),
      ].filter((section) => section.notes.length > 0);
  const navItems = sections.flatMap((section) => section.notes);
  const topicNames = new Map(topics.topics.map((t) => [t.id, t.name]));

  const { focusedId, setFocusedId, focused } = useListCursor(navItems, (n) => n.id, { enabled });
  const focusedEnabled = enabled && focused !== null;

  const openLink = async (note: Note) => {
    if (!note.link) return;
    try {
      await api.openLink(note.link);
    } catch (e) {
      report(e, 'Could not open link');
    }
  };

  const cycleType = async (note: Note) => {
    try {
      await api.updateNote(note.id, { noteType: cycleNext(NOTE_TYPES, note.noteType) });
      await refresh();
    } catch (e) {
      report(e, 'Could not change the type');
    }
  };

  const refetch = async (note: Note) => {
    try {
      await api.retryEnrichment(note.id);
      await refresh();
    } catch (e) {
      report(e, 'Could not fetch the source');
    }
  };

  const exportNotes = async (format: ExportFormat) => {
    setError('');
    setNotice('');
    try {
      const path = await api.exportNotes(topics.selectedId, format);
      if (path) setNotice(`Exported to ${path}`);
    } catch (e) {
      report(e, 'Could not export');
    }
  };

  const confirmDelete = async () => {
    const note = deletingNote;
    if (!note) return;
    const idx = navItems.findIndex((n) => n.id === note.id);
    const neighbour = navItems[idx + 1] ?? navItems[idx - 1] ?? null;
    setFocusedId(neighbour ? neighbour.id : null);
    setDeletingNote(null);
    try {
      await api.deleteNote(note.id);
      await refresh();
    } catch (e) {
      report(e, 'Could not delete note');
    }
  };

  const canCycleTopics = enabled && topics.topics.length > 0;
  useShortcut('ideaFilter.prev', { enabled: canCycleTopics, callback: () => topics.cycle(-1) });
  useShortcut('ideaFilter.next', { enabled: canCycleTopics, callback: () => topics.cycle(1) });
  // `⌫` deletes the selected topic only while no note is focused (same key as note delete).
  useShortcut('topic.delete', {
    enabled: enabled && focused === null && topics.selected !== null,
    callback: topics.requestDelete,
  });
  useShortcut('ideas.export', {
    enabled: enabled && notes.length > 0,
    callback: () => void exportNotes('markdown'),
  });
  useShortcut('ideas.exportJson', {
    enabled: enabled && notes.length > 0,
    callback: () => void exportNotes('json'),
  });

  // Bound here rather than in the editor hook: the confidentiality check needs the topics.
  const editorConfidential =
    topics.topics.find((t) => t.id === editor.topicId)?.sensitivity === 'confidential';
  useShortcut('noteEditor.improve', {
    enabled: editor.improvable && !editorConfidential,
    callback: () => void editor.improve(),
  });

  useShortcut('note.edit', {
    enabled: focusedEnabled,
    callback: () => {
      if (focused) editor.start(focused);
    },
  });
  useShortcut('note.type', {
    enabled: focusedEnabled,
    callback: () => {
      if (focused) void cycleType(focused);
    },
  });
  useShortcut('note.open', {
    enabled: focusedEnabled && focused?.link != null,
    callback: () => {
      if (focused) void openLink(focused);
    },
  });
  useShortcut('note.history', {
    enabled: focusedEnabled,
    callback: () => {
      if (focused) void history.open(focused);
    },
  });
  useShortcut('note.review', {
    enabled: focusedEnabled,
    callback: () => {
      if (focused) review.open(focused);
    },
  });
  useShortcut('ideas.reviewSession', {
    enabled: enabled && focused === null && dueVisible.length > 0,
    callback: () => review.startSession(dueVisible),
  });
  useShortcut('note.link', {
    enabled: focusedEnabled,
    callback: () => {
      if (focused) void picker.open(focused);
    },
  });
  useShortcut('note.refetch', {
    enabled: focusedEnabled && focused?.noteType === 'source' && focused.link !== null,
    callback: () => {
      if (focused) void refetch(focused);
    },
  });
  useShortcut('note.delete', {
    enabled: focusedEnabled,
    callback: () => {
      if (focused) setDeletingNote(focused);
    },
  });
  useShortcut('noteDelete.confirm', {
    enabled: deletingNote !== null,
    callback: () => void confirmDelete(),
  });
  useShortcut('noteDelete.cancel', {
    enabled: deletingNote !== null,
    callback: () => setDeletingNote(null),
  });

  useShortcut('browse.swallowTab', {
    enabled: !isEditing && topics.prompt === null,
    callback: () => {},
  });

  // A review session moves from note to note: keep the cursor on the one under review, so
  // its row scrolls into view and the popover has an anchor on screen.
  const reviewingId = review.current?.id;
  useEffect(() => {
    if (reviewingId) setFocusedId(reviewingId);
  }, [reviewingId, setFocusedId]);

  useEffect(() => {
    if (!focusedId) return;
    document.querySelector(`[data-note-id="${focusedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  const renderRow = (note: Note) => {
    const editing = editor.isEditing(note.id);
    const showingHistory = history.isOpen(note.id);
    const confirmingDelete = deletingNote?.id === note.id;
    const reviewing = review.current?.id === note.id;
    const linking = picker.isOpen(note.id);
    return (
      <NoteRow
        key={note.id}
        note={note}
        focused={focusedId === note.id}
        overlayOpen={editing || showingHistory || confirmingDelete || reviewing || linking}
        confirmingDelete={confirmingDelete}
        topicName={
          topics.selectedId === null && note.topicId ? topicNames.get(note.topicId) : undefined
        }
        onSelect={(n) => setFocusedId(n.id)}
        onOpenLink={openLink}
        onCloseOverlay={() => {
          if (editing) editor.cancel();
          else if (showingHistory) history.close();
          else if (reviewing) review.close();
          else if (linking) picker.close();
          else setDeletingNote(null);
        }}
      >
        {reviewing && <ReviewPopover review={review} />}
        {linking && <LinkPopover picker={picker} notes={notes} />}
        {editing && <NoteEditor editor={editor} error={error} topics={topics.topics} />}
        {showingHistory && <HistoryPopover note={note} history={history} />}
        {confirmingDelete && <DeleteNotePopover note={note} />}
      </NoteRow>
    );
  };

  return (
    <>
      <TopicFilterBar view={topics} />
      {topics.selected && !search.results && (
        <TopicHeader topic={topics.selected} notes={visible} />
      )}

      <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 shadow-sm transition focus-within:ring-1 focus-within:ring-ring">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          ref={search.searchRef}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            // Esc clears the query first, then blurs back to the list, like the archive.
            if (search.query) search.setQuery('');
            else search.searchRef.current?.blur();
          }}
          placeholder={topics.selected ? `Search in ${topics.selected.name}…` : 'Search notes…'}
          className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      {(error || notice) && !isEditing && (
        <p
          className={
            error
              ? 'line-clamp-2 text-[11px] text-destructive'
              : 'truncate text-[11px] text-muted-foreground'
          }
        >
          {error || notice}
        </p>
      )}

      {sections.length === 0 ? (
        <EmptyState
          searching={search.results !== null}
          hasNotes={notes.length > 0}
          ideaShortcut={ideaShortcut}
        />
      ) : (
        sections.map((section) => (
          <NoteSection key={section.key} title={section.title} count={section.notes.length}>
            <ul className="space-y-2">{section.notes.map(renderRow)}</ul>
          </NoteSection>
        ))
      )}
    </>
  );
}

function EmptyState({
  searching,
  hasNotes,
  ideaShortcut,
}: {
  searching: boolean;
  hasNotes: boolean;
  ideaShortcut: string;
}) {
  const message = searching
    ? 'No notes match that search.'
    : hasNotes
      ? 'Nothing in this topic yet.'
      : `Press ${ideaShortcut ? display(ideaShortcut) : 'the idea hotkey'} anywhere to capture an idea.`;
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <Lightbulb className="size-6" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
