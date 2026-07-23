import { ShortcutHint } from '@/components/ShortcutHint';
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

/** Confirm-before-delete modal. It has no buttons — ⏎ confirms (bound by the parent),
 *  Esc / backdrop cancel via Radix. */
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
        <ShortcutHint
          className="justify-center pt-1"
          shortcuts={[
            { keys: '⏎', label: 'delete' },
            { keys: 'Esc', label: 'cancel' },
          ]}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
