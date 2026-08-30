import { PopoverContent } from '@/components/ui/popover';
import type { ManagedRepo } from '@/generated/ManagedRepo';

/** Confirm-before-remove for a managed repo, as a popover anchored to the repo pills (like
 *  the delete-group popover). No buttons — ⌘↵ confirms, Esc cancels. Removing only stops
 *  tracking it: the repo's worktrees and git history are untouched. */
export function RepoDeletePopover({ repo }: { repo: ManagedRepo }) {
  return (
    <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
      <p className="text-sm font-medium">Stop tracking this repository?</p>
      <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
        “{repo.name}” is removed from the list. Its worktrees and git history are untouched.
      </p>
    </PopoverContent>
  );
}
