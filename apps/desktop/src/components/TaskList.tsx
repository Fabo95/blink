import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Inbox,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import type { Task } from '@/generated/Task';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const active = tasks.filter((t) => t.status !== 'done');
  const completed = tasks.filter((t) => t.status === 'done');

  const improve = async (task: Task) => {
    setImprovingId(task.id);
    setError('');
    try {
      await api.improveTask(task.id, task.text);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Optimization failed');
    } finally {
      setImprovingId(null);
    }
  };

  const toggleComplete = async (task: Task) => {
    await api.updateTask(task.id, { completed: task.status !== 'done' });
    onChanged();
  };

  const remove = async (task: Task) => {
    await api.deleteTask(task.id);
    onChanged();
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setDraft(task.text);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveEdit = async (task: Task) => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === task.text) {
      cancelEdit();
      return;
    }
    try {
      await api.updateTask(task.id, { text: trimmed });
      cancelEdit();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Could not save edit');
    }
  };

  const renderTask = (task: Task) => {
    const busy = improvingId === task.id;
    const done = task.status === 'done';
    const editing = editingId === task.id;
    return (
      <li key={task.id} className="group rounded-lg border bg-secondary/40 px-4 py-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => toggleComplete(task)}
            aria-label={done ? 'Mark as not done' : 'Mark as done'}
            className={cn(
              'mt-0.5 shrink-0 transition',
              done ? 'text-blink-success' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <Badge
              variant="secondary"
              className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {task.source.appName || task.source.appId}
            </Badge>
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void saveEdit(task);
                    }
                  }}
                  className="min-h-16 resize-none text-sm leading-relaxed"
                />
                <div className="flex items-center gap-2">
                  <span className="mr-auto text-[10px] text-muted-foreground">Esc · ⌘↵</span>
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={!draft.trim()} onClick={() => saveEdit(task)}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p
                className={cn(
                  'break-words text-sm font-medium',
                  done && 'text-muted-foreground line-through',
                )}
              >
                {task.text}
              </p>
            )}
          </div>
          {!editing && (
            // shrink-0 keeps the trigger put no matter how wide the text is; it stays
            // hidden until the row is hovered (or the menu is open, or a task is busy).
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Task actions"
                  className={cn(
                    'size-7 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 data-[state=open]:opacity-100',
                    busy && 'opacity-100',
                  )}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {!done && (
                  <DropdownMenuItem onSelect={() => startEdit(task)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                )}
                {!task.improved && !done && (
                  <DropdownMenuItem disabled={busy} onSelect={() => void improve(task)}>
                    <WandSparkles />
                    Improve with AI
                  </DropdownMenuItem>
                )}
                {!done && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => void remove(task)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </li>
    );
  };

  return (
    <Card className="panel">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Inbox
        </CardTitle>
        <span className="text-xs text-muted-foreground">{active.length} task(s)</span>
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

        {completed.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
              className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            >
              <ChevronRight
                className={cn('size-3.5 transition-transform', showCompleted && 'rotate-90')}
              />
              Completed ({completed.length})
            </button>
            {showCompleted && <ul className="mt-2 space-y-2">{completed.map(renderTask)}</ul>}
          </div>
        )}

        {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
