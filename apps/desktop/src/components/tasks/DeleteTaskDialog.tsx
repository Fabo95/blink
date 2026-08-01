import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Task } from '@/generated/Task';

interface DeleteTaskDialogProps {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
}

/** Confirm-before-delete modal. It has no buttons — ⌘↵ confirms, Esc cancels (commands
 *  bound by the parent, hinted by the statusline). */
export function DeleteTaskDialog({ task, onOpenChange }: DeleteTaskDialogProps) {
  return (
    <AlertDialog open={task !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
          <AlertDialogDescription className="line-clamp-3">
            “{task?.text}” will be permanently deleted. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
