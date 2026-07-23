import { Check, WandSparkles } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { ShortcutHint } from '@/components/ShortcutHint';
import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { TaskEditor as TaskEditorState } from '@/hooks/useTaskEditor';

interface TaskEditorProps {
  editor: TaskEditorState;
  error: string;
}

// Let native Tab move between the fields (it reliably reaches every one); only intercept
// at the ends to wrap, so focus stays inside the popover — Radix Popover doesn't trap it.
// Fields opt in with `data-editor-field`.
function cycleFields(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const fields = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-editor-field]'));
  if (fields.length < 2) return;
  const first = fields[0];
  const last = fields[fields.length - 1];
  if (!e.shiftKey && e.target === last) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && e.target === first) {
    e.preventDefault();
    last.focus();
  }
}

/** The in-row editor popover. Actions are keyboard-only (⇥ field / ⌘I / ⌘↵ / Esc). */
export function TaskEditor({ editor, error }: TaskEditorProps) {
  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      onKeyDown={cycleFields}
      className="w-[var(--radix-popover-trigger-width)] p-3"
    >
      <Textarea
        autoFocus
        data-editor-field
        value={editor.draft}
        onChange={(e) => editor.setDraft(e.target.value)}
        placeholder="Task"
        className="min-h-[68px] resize-none text-sm leading-relaxed"
      />
      <div className="my-3 h-px bg-border" />
      <div className="space-y-2">
        <Field label="Source" value={editor.source} onChange={editor.setSource} placeholder="Source" />
        <Field
          label="Link"
          type="url"
          value={editor.link}
          onChange={editor.setLink}
          placeholder="https://…"
        />
      </div>
      {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <ShortcutHint
          shortcuts={[
            { keys: '⇥', label: 'field' },
            ...(editor.improved ? [] : [{ keys: '⌘I', label: 'improve' }]),
            { keys: '⌘↵', label: 'save' },
            { keys: 'Esc', label: 'cancel' },
          ]}
        />
        <ImproveStatus improving={editor.improving} improved={editor.improved} />
      </div>
    </PopoverContent>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        type={type}
        data-editor-field
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 flex-1 text-sm"
      />
    </label>
  );
}

function ImproveStatus({ improving, improved }: { improving: boolean; improved: boolean }) {
  if (improving) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-blink-bright">
        <WandSparkles className="size-3 animate-pulse" />
        Improving…
      </span>
    );
  }
  if (improved) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-blink-success">
        <Check className="size-3" />
        Improved
      </span>
    );
  }
  return null;
}
