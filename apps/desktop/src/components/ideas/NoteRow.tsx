import { ExternalLink, FolderOpen, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { NoteTypeIcon } from '@/components/ideas/NoteTypeIcon';
import { Popover, PopoverAnchor } from '@/components/ui/popover';
import type { Note } from '@/generated/Note';
import { linkLabel } from '@/lib/link';
import { NOTE_TYPE_LABEL, shortAge } from '@/lib/notes';
import { cn } from '@/lib/utils';

interface NoteRowProps {
  note: Note;
  focused: boolean;
  /** True while one of this row's overlays (editor, history, delete confirm) is open. */
  overlayOpen: boolean;
  confirmingDelete: boolean;
  /** The note's topic name, shown as a chip (omitted while a topic filter is active). */
  topicName?: string;
  onSelect: (note: Note) => void;
  onOpenLink: (note: Note) => void;
  onCloseOverlay: () => void;
  /** The open overlay's `PopoverContent`. */
  children?: ReactNode;
}

/** One note in the Ideas list. Mirrors `TaskRow`: a whole-card mouse target for selection,
 *  content that ignores pointer events, and one anchored popover for its overlays. */
export function NoteRow({
  note,
  focused,
  overlayOpen,
  confirmingDelete,
  topicName,
  onSelect,
  onOpenLink,
  onCloseOverlay,
  children,
}: NoteRowProps) {
  const source = note.source.appName || note.source.appId;
  return (
    <Popover
      open={overlayOpen}
      onOpenChange={(open) => {
        if (!open) onCloseOverlay();
      }}
    >
      <PopoverAnchor asChild>
        <li
          data-note-id={note.id}
          className={cn(
            'group relative rounded-xl border border-border/60 bg-card/40 px-3.5 py-3 transition-colors',
            focused && 'border-primary/40 bg-card/70',
            overlayOpen &&
              !confirmingDelete &&
              'border-primary/40 bg-card/70 ring-2 ring-primary/30',
            confirmingDelete && 'border-destructive/50 bg-card/70 ring-2 ring-destructive/30',
          )}
        >
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(note)}
            className="absolute inset-0 rounded-xl"
          />
          {focused && !overlayOpen && (
            <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
          )}
          <div className="pointer-events-none relative flex items-start gap-3">
            <NoteTypeIcon type={note.noteType} className="mt-0.5 text-muted-foreground" />
            <span className="sr-only">{NOTE_TYPE_LABEL[note.noteType].one}</span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">
                {note.text}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>{source}</span>
                {note.link && (
                  <>
                    <Separator />
                    <button
                      type="button"
                      onClick={() => onOpenLink(note)}
                      title={note.link}
                      className="pointer-events-auto relative inline-flex min-w-0 items-center gap-1 text-blink-bright transition hover:underline"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{linkLabel(note.link)}</span>
                    </button>
                  </>
                )}
                {topicName && (
                  <>
                    <Separator />
                    <span className="inline-flex items-center gap-1">
                      <FolderOpen className="size-3 shrink-0" />
                      {topicName}
                    </span>
                  </>
                )}
                {note.conflict && (
                  <>
                    <Separator />
                    <span className="inline-flex items-center gap-1 text-blink-bright">
                      <TriangleAlert className="size-3 shrink-0" />
                      Changed on another device, press y
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {shortAge(note.createdAt)}
            </span>
          </div>
        </li>
      </PopoverAnchor>
      {children}
    </Popover>
  );
}

function Separator() {
  return (
    <span aria-hidden className="text-muted-foreground/30">
      ·
    </span>
  );
}
