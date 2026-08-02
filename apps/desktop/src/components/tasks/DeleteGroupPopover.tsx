import { PopoverContent } from '@/components/ui/popover';
import type { TaskGroup } from '@/generated/TaskGroup';

/** Confirm-before-delete for a group, as a popover anchored to the filter bar (like the
 *  task delete popover) instead of a centered modal. No buttons — ⌘↵ confirms, Esc cancels
 *  (bound in `useTaskGroups`). Tasks survive: they just move back to All. */
export function DeleteGroupPopover({ group }: { group: TaskGroup }) {
  return (
    <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
      <p className="text-sm font-medium">Delete this group?</p>
      <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
        “{group.name}” will be deleted. Its tasks are kept and move back to All.
      </p>
    </PopoverContent>
  );
}
