import { Check, ChevronDown, WandSparkles } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { ShortcutHint } from '@/components/ShortcutHint';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { TaskEditor as TaskEditorState } from '@/hooks/useTaskEditor';

interface TaskEditorProps {
  editor: TaskEditorState;
  error: string;
  groups: TaskGroup[];
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
export function TaskEditor({ editor, error, groups }: TaskEditorProps) {
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
        <Field
          label="Source"
          value={editor.source}
          onChange={editor.setSource}
          placeholder="Source"
        />
        <Field
          label="Link"
          type="url"
          value={editor.link}
          onChange={editor.setLink}
          placeholder="https://…"
        />
        {groups.length > 0 && <GroupField editor={editor} groups={groups} />}
      </div>
      {error && <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <ShortcutHint
          shortcuts={[
            { keys: '⇥', label: 'field' },
            ...(editor.improved ? [] : [{ keys: '⌘i', label: 'improve' }]),
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

// A picker field, not an action button: it sits in the ⇥ cycle like the inputs
// (`data-editor-field`), opens with ↵/Space, and the menu's arrows+↵ select.
function GroupField({ editor, groups }: { editor: TaskEditorState; groups: TaskGroup[] }) {
  const selectedName = groups.find((g) => g.id === editor.taskGroupId)?.name;
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Group
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-editor-field
            className="flex h-8 flex-1 items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className={selectedName ? undefined : 'text-muted-foreground'}>
              {selectedName ?? 'No group'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <DropdownMenuRadioGroup
            value={editor.taskGroupId ?? ''}
            onValueChange={(value) => editor.setTaskGroupId(value || null)}
          >
            <DropdownMenuRadioItem value="">No group</DropdownMenuRadioItem>
            {groups.map((group) => (
              <DropdownMenuRadioItem key={group.id} value={group.id}>
                {group.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
