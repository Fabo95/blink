import { Inbox, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Task } from '@/generated/Task';
import { api } from '@/lib/api';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  return (
    <Card>
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
            {tasks.map((task) => (
              <li key={task.id} className="group rounded-lg border bg-secondary/40 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {task.body.split('\n', 1)[0]}
                    </p>
                    <Badge variant="secondary" className="mt-1.5">
                      {task.source.appId}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete task"
                    className="opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    onClick={async () => {
                      await api.deleteTask(task.id);
                      onChanged();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
