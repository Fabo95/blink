import type { Task } from '@/generated/Task';

/** A completion counts as "recent" (shown in the inbox's Completed card) for this long. */
export const RECENT_COMPLETION_MS = 24 * 60 * 60 * 1000;

export interface DayGroup {
  key: string;
  label: string;
  tasks: Task[];
}

export interface TaskBuckets {
  /** Not done — the inbox. */
  active: Task[];
  /** Done within the last {@link RECENT_COMPLETION_MS}. */
  recentCompleted: Task[];
  /** Done longer ago — the archive. */
  archived: Task[];
}

/** Split tasks into the three sections the inbox renders. */
export function splitTasks(tasks: Task[], now: number = Date.now()): TaskBuckets {
  const recentSince = now - RECENT_COMPLETION_MS;
  const buckets: TaskBuckets = { active: [], recentCompleted: [], archived: [] };
  for (const task of tasks) {
    if (task.status !== 'done') {
      buckets.active.push(task);
    } else if (task.completedAt != null && Date.parse(task.completedAt) >= recentSince) {
      buckets.recentCompleted.push(task);
    } else {
      buckets.archived.push(task);
    }
  }
  return buckets;
}

// When a task was completed. Falls back to updatedAt for the rare done row with no
// completed_at (e.g. rows finished before that column existed).
function completionTime(task: Task): number {
  const stamp = task.completedAt ?? task.updatedAt;
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function relativeLabel(dayStart: number, todayStart: number): string {
  const diffDays = Math.round((todayStart - dayStart) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const d = new Date(dayStart);
  // Within the last week, the weekday alone is unambiguous ("Monday").
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

// Bucket completed tasks by calendar day, most recent first, with human labels
// (Today / Yesterday / weekday / date). Insertion order is preserved from the
// most-recent-first sort, so the returned groups are already ordered.
export function groupByDay(tasks: Task[]): DayGroup[] {
  const todayStart = startOfDay(Date.now());
  const sorted = [...tasks].sort((a, b) => completionTime(b) - completionTime(a));

  const buckets = new Map<number, Task[]>();
  for (const task of sorted) {
    const dayStart = startOfDay(completionTime(task));
    const existing = buckets.get(dayStart);
    if (existing) existing.push(task);
    else buckets.set(dayStart, [task]);
  }

  return [...buckets.entries()].map(([dayStart, groupTasks]) => ({
    key: String(dayStart),
    label: relativeLabel(dayStart, todayStart),
    tasks: groupTasks,
  }));
}
