import { PopoverContent } from '@/components/ui/popover';
import type { Note } from '@/generated/Note';

/** Confirm-before-delete as an in-row popover. No buttons: ⌘↵ confirms, Esc cancels
 *  (bound in `IdeasPage`, hinted in the statusline). */
export function DeleteNotePopover({ note }: { note: Note }) {
  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      <p className="text-sm font-medium">Delete this note?</p>
      <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
        “{note.text}” and its earlier versions will be deleted on every device.
      </p>
    </PopoverContent>
  );
}
