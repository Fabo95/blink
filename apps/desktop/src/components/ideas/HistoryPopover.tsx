import { TriangleAlert } from 'lucide-react';
import { PopoverContent } from '@/components/ui/popover';
import type { Note } from '@/generated/Note';
import type { NoteHistoryView } from '@/hooks/useNoteHistory';
import { cn } from '@/lib/utils';

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A note's earlier versions, newest first, plus the frozen original capture. Keys live in
 *  `useNoteHistory` (↑↓ pick, ⌘↵ restore, Esc close). */
export function HistoryPopover({ note, history }: { note: Note; history: NoteHistoryView }) {
  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Earlier versions
      </p>
      {history.revisions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No earlier versions. Edits keep the previous text here.
        </p>
      ) : (
        <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
          {history.revisions.map((revision, idx) => (
            <li
              key={revision.id}
              className={cn(
                'rounded-md border px-2.5 py-2',
                idx === history.selected
                  ? 'border-primary/40 bg-card/70'
                  : 'border-border/60 bg-card/30',
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {revision.reason === 'conflict' && (
                  <span className="inline-flex items-center gap-1 text-blink-bright">
                    <TriangleAlert className="size-3" />
                    Replaced by a sync from another device
                  </span>
                )}
                <span>{formatter.format(new Date(revision.createdAt))}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{revision.text}</p>
            </li>
          ))}
        </ul>
      )}
      {note.rawText !== note.text && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            As captured
          </p>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[12px] text-muted-foreground">
            {note.rawText}
          </p>
        </div>
      )}
    </PopoverContent>
  );
}
