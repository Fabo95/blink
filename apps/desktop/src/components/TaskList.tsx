import { CheckCircle2, Circle, Inbox, Loader2, Trash2, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Task } from '@/generated/Task';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const [error, setError] = useState('');

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
    await api.setTaskCompleted(task.id, task.status !== 'done');
    onChanged();
  };

  return (
    <Card className="panel">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="section-bar text-sm font-semibold uppercase tracking-wide text-primary">
          Inbox
        </CardTitle>
        <span className="text-xs text-muted-foreground">{tasks.length} task(s)</span>
      </CardHeader>

      <CardContent>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
            <Inbox className="size-6" />
            <p className="text-sm">No tasks yet — capture something above.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const busy = improvingId === task.id;
              const done = task.status === 'done';
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
                      <p
                        className={cn(
                          'break-words text-sm font-medium',
                          done && 'text-muted-foreground line-through',
                        )}
                      >
                        {task.text}
                      </p>
                    </div>
                    {/* shrink-0 keeps the actions full-size no matter how wide the text is */}
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100',
                        busy && 'opacity-100',
                      )}
                    >
                      {!task.improved && !done && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Improve with AI"
                          disabled={busy}
                          className="text-blink-bright"
                          onClick={() => improve(task)}
                        >
                          {busy ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete task"
                        className="hover:text-destructive"
                        onClick={async () => {
                          await api.deleteTask(task.id);
                          onChanged();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
