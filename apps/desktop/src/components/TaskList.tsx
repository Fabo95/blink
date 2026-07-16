import type { Task } from '@blink/core';
import { api } from '../lib/api.js';

interface TaskListProps {
  tasks: Task[];
  onChanged: () => void;
}

export function TaskList({ tasks, onChanged }: TaskListProps) {
  return (
    <section className="rounded-xl border border-blink-border bg-blink-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-bar text-sm font-semibold uppercase tracking-wide text-blink-bright">
          Inbox
        </h2>
        <span className="text-xs text-blink-muted">{tasks.length} task(s)</span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-blink-muted">No tasks yet — capture something above.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group rounded-lg border border-blink-border bg-blink-elevated px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-blink-text">{task.title}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-blink-muted">
                    {task.body.split('\n', 1)[0]}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-blink-muted">
                    {task.source.appId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteTask(task.id);
                    onChanged();
                  }}
                  className="text-xs text-blink-muted opacity-0 transition group-hover:opacity-100 hover:text-blink-danger"
                  aria-label="Delete task"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
