import type { TaskEffort } from '@/generated/TaskEffort';

/** The effort scale in display order — also the order `1`/`2`/`3` map to. */
export const EFFORT_OPTIONS: { value: TaskEffort; label: string }[] = [
  { value: 'quick', label: '5 min' },
  { value: 'standard', label: 'Normal' },
  { value: 'deep', label: 'Deep' },
];

export function effortLabel(effort: TaskEffort): string {
  return EFFORT_OPTIONS.find((o) => o.value === effort)?.label ?? effort;
}

/** Badge tint per rung. `standard` is the unlabelled default and deliberately has none —
 *  the inbox only lights up where you actually made a call. */
export const EFFORT_BADGE: Partial<Record<TaskEffort, string>> = {
  quick: 'border-blink-bright/40 bg-blink-bright/10 text-blink-bright',
  deep: 'border-primary/40 bg-primary/10 text-primary',
};
