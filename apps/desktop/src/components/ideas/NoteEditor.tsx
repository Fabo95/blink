import { Check, Lock, WandSparkles } from 'lucide-react';
import { PickerField } from '@/components/ideas/PickerField';
import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { Topic } from '@/generated/Topic';
import type { NoteEditor as NoteEditorState } from '@/hooks/useNoteEditor';
import { NOTE_TYPE_LABEL, NOTE_TYPES } from '@/lib/notes';

const FIELD = { 'data-note-field': true };

/** The in-row note editor popover. Its commands (⇥ / ⌘i / ⌘↵ / Esc) live in
 *  `useNoteEditor` and are hinted by the statusline. */
export function NoteEditor({
  editor,
  error,
  topics,
}: {
  editor: NoteEditorState;
  error: string;
  topics: Topic[];
}) {
  const confidential = topics.find((t) => t.id === editor.topicId)?.sensitivity === 'confidential';
  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      <Textarea
        autoFocus
        data-note-field
        value={editor.draft}
        onChange={(e) => editor.setDraft(e.target.value)}
        placeholder="Note"
        className="min-h-[84px] resize-none text-sm leading-relaxed"
      />
      <div className="my-3 h-px bg-border" />
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Link
          </span>
          <Input
            type="url"
            aria-label="Link"
            data-note-field
            value={editor.link}
            onChange={(e) => editor.setLink(e.target.value)}
            placeholder="https://…"
            className="h-8 flex-1 text-sm"
          />
        </div>
        <PickerField
          label="Type"
          value={editor.noteType}
          options={NOTE_TYPES.map((type) => ({
            value: type,
            label: NOTE_TYPE_LABEL[type].one,
          }))}
          onChange={(value) => {
            // Radix hands back a plain string; narrow against the known types.
            const picked = NOTE_TYPES.find((type) => type === value);
            if (picked) editor.setNoteType(picked);
          }}
          fieldMarker={FIELD}
        />
        <PickerField
          label="Topic"
          value={editor.topicId ?? ''}
          options={[
            { value: '', label: 'No topic' },
            ...topics.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(value) => editor.setTopicId(value || null)}
          fieldMarker={FIELD}
        />
      </div>
      {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
      <div className="mt-3 flex items-center justify-end text-[11px]">
        {editor.improving ? (
          <span className="flex items-center gap-1.5 text-blink-bright">
            <WandSparkles className="size-3 animate-pulse" />
            Improving…
          </span>
        ) : editor.improved ? (
          <span className="flex items-center gap-1.5 text-blink-success">
            <Check className="size-3" />
            Improved
          </span>
        ) : confidential ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Lock className="size-3" />
            Confidential topic, AI off
          </span>
        ) : null}
      </div>
    </PopoverContent>
  );
}
