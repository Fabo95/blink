import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { TaskGroup } from '@/generated/TaskGroup';

interface DeleteGroupDialogProps {
  group: TaskGroup | null;
  onOpenChange: (open: boolean) => void;
}

/** Confirm-before-delete modal for a group. It has no buttons — ⌘↵ confirms, Esc cancels
 *  (commands bound by `useTaskGroups`, hinted by the statusline). Tasks survive: they
 *  just un-group. */
export function DeleteGroupDialog({ group, onOpenChange }: DeleteGroupDialogProps) {
  return (
    <AlertDialog open={group !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this group?</AlertDialogTitle>
          <AlertDialogDescription className="line-clamp-3">
            “{group?.name}” will be deleted. Its tasks are kept and move back to All.
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
