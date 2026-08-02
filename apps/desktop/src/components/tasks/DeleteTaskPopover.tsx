import { PopoverContent } from '@/components/ui/popover';
import type { Task } from '@/generated/Task';

/** Confirm-before-delete as an in-row popover (like the editor), so it sits by the task
 *  instead of a centered modal covering the statusline. No buttons — ⌘↵ confirms, Esc
 *  cancels (bound in `TaskList`, hinted in the statusline). */
export function DeleteTaskPopover({ task }: { task: Task }) {
  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      <p className="text-sm font-medium">Delete this task?</p>
      <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
        “{task.text}” will be permanently deleted. This can't be undone.
      </p>
    </PopoverContent>
  );
}
