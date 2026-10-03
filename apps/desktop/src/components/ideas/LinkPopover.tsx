import type { ReactNode } from 'react';
import { NoteTypeIcon } from '@/components/ideas/NoteTypeIcon';
import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import type { Note } from '@/generated/Note';
import type { NoteLink } from '@/generated/NoteLink';
import type { NoteRelation } from '@/generated/NoteRelation';
import { type LinkPickerView, RELATIONS } from '@/hooks/useLinkPicker';
import { cn } from '@/lib/utils';

const OUTGOING: Record<NoteRelation, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  related: 'Related to',
};

const INCOMING: Record<NoteRelation, string> = {
  supports: 'Supported by',
  contradicts: 'Contradicted by',
  related: 'Related to',
};

/** The in-row link picker. Keys live in `useLinkPicker` and are hinted by the statusline. */
export function LinkPopover({ picker, notes }: { picker: LinkPickerView; notes: Note[] }) {
  const note = picker.note;
  if (!note) return null;
  const byId = new Map(notes.map((n) => [n.id, n]));

  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      {picker.step === 'pick' ? (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Evidence
          </p>
          <Input
            autoFocus
            aria-label="Find a note to link"
            value={picker.query}
            onChange={(e) => picker.setQuery(e.target.value)}
            placeholder="Find a note to link…"
            className="mt-2 h-8 text-sm"
          />
          {picker.query ? (
            picker.candidates.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">No other note matches.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {picker.candidates.map((candidate, idx) => (
                  <Option key={candidate.id} active={idx === picker.selected}>
                    <NoteTypeIcon type={candidate.noteType} className="text-muted-foreground" />
                    <span className="truncate">{candidate.title ?? candidate.text}</span>
                  </Option>
                ))}
              </ul>
            )
          ) : picker.links.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              No links yet. Search for a source or idea this note supports or contradicts.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {picker.links.map((link, idx) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  noteId={note.id}
                  other={byId.get(link.fromNoteId === note.id ? link.toNoteId : link.fromNoteId)}
                  active={idx === picker.selected}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            This note…
          </p>
          <ul className="mt-2 space-y-1">
            {RELATIONS.map((relation, idx) => (
              <Option key={relation} active={idx === picker.selected}>
                <span className="font-medium">{relation}</span>
                <span className="truncate text-muted-foreground">
                  “{picker.target?.title ?? picker.target?.text}”
                </span>
              </Option>
            ))}
          </ul>
        </>
      )}
      {picker.error && (
        <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{picker.error}</p>
      )}
    </PopoverContent>
  );
}

function LinkRow({
  link,
  noteId,
  other,
  active,
}: {
  link: NoteLink;
  noteId: string;
  other: Note | undefined;
  active: boolean;
}) {
  const outgoing = link.fromNoteId === noteId;
  return (
    <Option active={active}>
      <span
        className={cn(
          'shrink-0 text-[11px]',
          link.relation === 'supports' && 'text-blink-success',
          link.relation === 'contradicts' && 'text-destructive',
          link.relation === 'related' && 'text-muted-foreground',
        )}
      >
        {(outgoing ? OUTGOING : INCOMING)[link.relation]}
      </span>
      <span className="truncate">{other ? (other.title ?? other.text) : 'a deleted note'}</span>
    </Option>
  );
}

function Option({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
        active ? 'border-primary/40 bg-card/70' : 'border-transparent',
      )}
    >
      {children}
    </li>
  );
}
