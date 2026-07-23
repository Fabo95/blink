import { Check, ChevronRight, ExternalLink, Inbox, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { ShortcutHint } from '@/components/ShortcutHint';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useListCursor } from '@/hooks/useListCursor';
import type { Task } from '@/generated/Task';
import { api } from '@/lib/api';
import { linkLabel, normalizeLink } from '@/lib/link';
import { cn } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  const [improvingDraft, setImprovingDraft] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftSource, setDraftSource] = useState('');
  // Whether the current draft text is AI-improved — starts from the task's flag, set on
  // improve, cleared on manual text edit. Gates ⌘I so improving is once per version.
  const [draftImproved, setDraftImproved] = useState(false);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [error, setError] = useState('');

  const active = tasks.filter((t) => t.status !== 'done');
  const completed = tasks.filter((t) => t.status === 'done');

  const toggleComplete = async (task: Task) => {
    await api.updateTask(task.id, { completed: task.status !== 'done' });
    onChanged();
  };

  // Delete asks first — open the confirm modal; the real delete is confirmDelete.
  const remove = (task: Task) => setDeletingTask(task);

  const openLink = async (task: Task) => {
    if (!task.link) return;
    try {
      await api.openLink(task.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Could not open link');
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setDraft(task.text);
    setDraftLink(task.link ?? '');
    setDraftSource(task.source.appName || task.source.appId);
    setDraftImproved(task.improved);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
    setDraftLink('');
    setDraftSource('');
    setDraftImproved(false);
  };

  const saveEdit = async (task: Task) => {
    const trimmedText = draft.trim();
    if (!trimmedText) {
      cancelEdit();
      return;
    }
    // Send only the fields that actually changed. An empty link clears it.
    const patch: { text?: string; link?: string; source?: string; improved?: boolean } = {};
    if (trimmedText !== task.text) patch.text = trimmedText;
    const nextLink = normalizeLink(draftLink) ?? '';
    if (nextLink !== (task.link ?? '')) patch.link = nextLink;
    const nextSource = draftSource.trim();
    if (nextSource !== (task.source.appName || task.source.appId)) patch.source = nextSource;
    if (draftImproved !== task.improved) patch.improved = draftImproved;

    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }
    try {
      await api.updateTask(task.id, patch);
      cancelEdit();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Could not save edit');
    }
  };

  // Clean up the draft text with AI, in place — the user reviews it, then Saves.
  const improveDraft = async () => {
    const text = draft.trim();
    if (!text || draftImproved) return;
    setImprovingDraft(true);
    setError('');
    try {
      setDraft(await api.improveText(text));
      setDraftImproved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'Could not improve text',
      );
    } finally {
      setImprovingDraft(false);
    }
  };

  // ↑/↓ (or j/k) move a cursor over the active inbox; ⏎ completes, e edits, ⌫ deletes,
  // Esc clears. Suspended while the popover editor is open.
  // The cursor spans the inbox and the (expanded) completed section, so the same keys
  // work in both — ⏎ completes an active task or restores a completed one.
  const navItems = showCompleted ? [...active, ...completed] : active;
  const { focusedId, setFocusedId } = useListCursor(navItems, (t) => t.id, {
    onEnter: toggleComplete,
    onEdit: startEdit,
    onDelete: remove,
    onOpenLink: openLink,
    // Suspended while the editor popover or the delete-confirm modal is open, so their
    // own Enter/Esc handling wins.
    disabled: editingId !== null || deletingTask !== null,
  });

  const overlayOpen = editingId !== null || deletingTask !== null;
  // c toggles the Completed section; ⌘I improves the open editor's draft.
  useHotkeys('c', () => setShowCompleted((v) => !v), {
    enabled: completed.length > 0 && !overlayOpen,
  });
  useHotkeys('mod+i', () => void improveDraft(), {
    enabled: editingId !== null && !draftImproved,
    enableOnFormTags: true,
    preventDefault: true,
  });

  // ⌘↵ saves the open editor (fires even with focus inside a field).
  const editingTask = tasks.find((t) => t.id === editingId) ?? null;
  useHotkeys(
    'mod+enter',
    () => {
      if (editingTask) void saveEdit(editingTask);
    },
    { enabled: editingTask !== null, enableOnFormTags: true, preventDefault: true },
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
      setError(
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'Could not delete task',
      );
    }
  };

  // The delete modal has no buttons — ⏎ confirms (Esc/backdrop cancel via Radix).
  useHotkeys('enter', () => void confirmDelete(), {
    enabled: deletingTask !== null,
    preventDefault: true,
  });

  const renderTask = (task: Task) => {
    const done = task.status === 'done';
    const editing = editingId === task.id;
    const focused = focusedId === task.id;
    const source = task.source.appName || task.source.appId;

    return (
      <Popover key={task.id} open={editing} onOpenChange={(open) => !open && cancelEdit()}>
        <PopoverAnchor asChild>
          <li
            className={cn(
              'group relative rounded-xl border border-border/60 bg-card/40 px-3.5 py-3 transition-colors',
              focused && 'border-primary/40 bg-card/70',
              editing && 'border-primary/40 bg-card/70 ring-2 ring-primary/30',
            )}
          >
            {/* Whole-card click target: single-click selects (then ⏎ completes), double-click
                completes. aria-hidden + tabIndex -1 keep it mouse-only (keyboard uses the
                cursor); mousedown-preventDefault keeps focus on <body> so nav keeps working. */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setFocusedId(task.id)}
              onDoubleClick={() => void toggleComplete(task)}
              className="absolute inset-0 rounded-xl"
            />
            {focused && !editing && (
              <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
            )}
            {/* Content sits above the overlay but ignores pointer events, so clicks fall
                through to select — except the link chip, which re-enables its own. */}
            <div className="pointer-events-none relative flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'break-words text-sm font-medium leading-snug',
                    done && 'text-muted-foreground line-through',
                  )}
                >
                  {task.text}
                </p>

                {/* Quiet metadata footer: source, then a clickable link chip. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    {source}
                  </span>
                  {task.link && (
                    <>
                      <span aria-hidden className="text-muted-foreground/30">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => openLink(task)}
                        title={task.link}
                        className="pointer-events-auto relative inline-flex min-w-0 items-center gap-1 text-blink-bright transition hover:underline"
                      >
                        <ExternalLink className="size-3 shrink-0" />
                        <span className="truncate">{linkLabel(task.link)}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </li>
        </PopoverAnchor>

        {/* Editor floats anchored to the row, so the list never reflows while editing. */}
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-[var(--radix-popover-trigger-width)] p-3"
        >
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftImproved(false);
            }}
            placeholder="Task"
            className="min-h-[68px] resize-none text-sm leading-relaxed"
          />
          <div className="my-3 h-px bg-border" />
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Source
              </span>
              <Input
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
                placeholder="Source"
                className="h-8 flex-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Link
              </span>
              <Input
                type="url"
                value={draftLink}
                onChange={(e) => setDraftLink(e.target.value)}
                placeholder="https://…"
                className="h-8 flex-1 text-sm"
              />
            </label>
          </div>
          {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <ShortcutHint
              shortcuts={[
                ...(draftImproved ? [] : [{ keys: '⌘I', label: 'improve' }]),
                { keys: '⌘↵', label: 'save' },
                { keys: 'Esc', label: 'cancel' },
              ]}
            />
            {improvingDraft ? (
              <span className="flex items-center gap-1.5 text-[11px] text-blink-bright">
                <WandSparkles className="size-3 animate-pulse" />
                Improving…
              </span>
            ) : draftImproved ? (
              <span className="flex items-center gap-1.5 text-[11px] text-blink-success">
                <Check className="size-3" />
                Improved
              </span>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <>
      <Card className="panel">
        <CardHeader className="space-y-1.5">
          <div className="flex items-center justify-between">
            <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
              Inbox
            </CardTitle>
            <span className="text-xs text-muted-foreground">{active.length} task(s)</span>
          </div>
          {active.length > 0 && (
            <ShortcutHint
              shortcuts={[
                { keys: '↑↓', label: 'navigate' },
                { keys: '⏎', label: 'complete' },
                { keys: 'e', label: 'edit' },
                { keys: 'o', label: 'open' },
                { keys: '⌫', label: 'delete' },
              ]}
            />
          )}
        </CardHeader>

        <CardContent>
          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <Inbox className="size-6" />
              <p className="text-sm">
                {completed.length > 0
                  ? 'Inbox zero — all caught up.'
                  : 'No tasks yet — capture something above.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">{active.map(renderTask)}</ul>
          )}
          {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card className="panel">
          <CardHeader className="space-y-1.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className="section-bar flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-primary transition hover:opacity-80"
              >
                Completed
                <ChevronRight
                  className={cn('size-4 transition-transform', showCompleted && 'rotate-90')}
                />
              </button>
              <div className="flex items-center gap-2">
                <ShortcutHint
                  shortcuts={[{ keys: 'c', label: showCompleted ? 'collapse' : 'expand' }]}
                />
                <span className="text-xs text-muted-foreground">{completed.length}</span>
              </div>
            </div>
            {showCompleted && (
              <ShortcutHint
                shortcuts={[
                  { keys: '↑↓', label: 'navigate' },
                  { keys: '⏎', label: 'restore' },
                  { keys: 'e', label: 'edit' },
                  { keys: 'o', label: 'open' },
                  { keys: '⌫', label: 'delete' },
                ]}
              />
            )}
          </CardHeader>

          {showCompleted && (
            <CardContent>
              <ul className="space-y-2">{completed.map(renderTask)}</ul>
            </CardContent>
          )}
        </Card>
      )}

      <AlertDialog
        open={deletingTask !== null}
        onOpenChange={(open) => !open && setDeletingTask(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3">
              “{deletingTask?.text}” will be permanently deleted. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ShortcutHint
            className="justify-center pt-1"
            shortcuts={[
              { keys: '⏎', label: 'delete' },
              { keys: 'Esc', label: 'cancel' },
            ]}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
