import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Kbd } from '@/components/ui/kbd';
import { CHEATSHEET, SHORTCUTS, type Shortcut } from './shortcuts';

/** The `?` cheat-sheet: every shortcut grouped by type with a full description. A
 *  reference (shows all keys, not just the enabled ones), so it's the one place a new
 *  user learns what each key does. Esc / `c` close it (bound in `TaskList`). */
export function ShortcutHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg gap-5">
        <AlertDialogHeader>
          <AlertDialogTitle>Keyboard shortcuts</AlertDialogTitle>
          <AlertDialogDescription>Press a key to run it, or Esc to close.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {CHEATSHEET.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {section.ids.map((id) => {
                  const shortcut: Shortcut = SHORTCUTS[id];
                  if (!shortcut.hint) return null;
                  return (
                    <li key={id} className="flex items-center gap-2.5 text-sm">
                      <Kbd>{shortcut.hint.keys}</Kbd>
                      <span className="text-muted-foreground">{shortcut.describe}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
