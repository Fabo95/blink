import { useRef } from 'react';
import { DeleteGroupPopover } from '@/components/tasks/DeleteGroupPopover';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { TaskGroupsView } from '@/hooks/useTaskGroups';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

// Native Tab moves between the edit prompt's fields (`data-group-field`); intercept only
// at the ends to wrap, so focus stays inside the popover — Radix Popover doesn't trap it.
// Mirrors the task editor's `wrapEditorFields`.
function wrapGroupFields(e: KeyboardEvent) {
  const fields = Array.from(document.querySelectorAll<HTMLElement>('[data-group-field]'));
  const first = fields[0];
  const last = fields[fields.length - 1];
  if (fields.length < 2 || first === undefined || last === undefined) return;
  if (!e.shiftKey && e.target === last) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && e.target === first) {
    e.preventDefault();
    last.focus();
  }
}

/**
 * The group filter above the inbox: an All pill plus one per group. Keyboard-only
 * management — `n` creates, `r` edits (name + context), `⌫` deletes; switching (`←→`/`hl`)
 * is bound in TaskList and hinted in the footer statusline. The edit prompt and the delete
 * confirm are popovers anchored to the pill row, opened exclusively by those keys. Pills
 * click-to-select (parity with rows), but carry no management affordances.
 */
export function GroupFilterBar({ view }: { view: TaskGroupsView }) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLTextAreaElement>(null);
  const editing = view.prompt === 'edit';
  // The prompt's commands live here because the (uncontrolled) inputs do; the prompt
  // itself is opened by useTaskGroups. Both prompts carry two fields (name + context),
  // so ⇥ wraps between them.
  useShortcut('groupPrompt.field', {
    enabled: view.prompt !== null,
    callback: wrapGroupFields,
  });
  useShortcut('groupPrompt.submit', {
    enabled: view.prompt !== null,
    callback: () =>
      void view.submitPrompt(nameInputRef.current?.value ?? '', contextInputRef.current?.value),
  });
  useShortcut('groupPrompt.cancel', { enabled: view.prompt !== null, callback: view.closePrompt });

  return (
    <div className="space-y-1.5">
      <Popover
        open={view.prompt !== null || view.deleting}
        onOpenChange={(open) => {
          if (open) return;
          if (view.prompt !== null) view.closePrompt();
          else view.cancelDelete();
        }}
      >
        <PopoverAnchor asChild>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill
              label="All"
              selected={view.selectedId === null}
              onSelect={() => view.select(null)}
            />
            {view.groups.map((group) => (
              <Pill
                key={group.id}
                label={group.name}
                selected={view.selectedId === group.id}
                onSelect={() => view.select(group.id)}
              />
            ))}
          </div>
        </PopoverAnchor>
        {view.prompt !== null && (
          <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {editing ? 'Edit group' : 'New group'}
            </p>
            <Input
              ref={nameInputRef}
              autoFocus
              data-group-field
              defaultValue={editing ? (view.selected?.name ?? '') : ''}
              placeholder="Group name"
              className="h-8 text-sm"
            />
            <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Context
            </p>
            <Textarea
              ref={contextInputRef}
              data-group-field
              defaultValue={editing ? (view.selected?.context ?? '') : ''}
              placeholder="Guidance folded into AI prompts for this group's tasks"
              className="min-h-[68px] resize-none text-sm leading-relaxed"
            />
            {view.error && (
              <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{view.error}</p>
            )}
          </PopoverContent>
        )}
        {view.deleting && view.selected && <DeleteGroupPopover group={view.selected} />}
      </Popover>
      {view.error && view.prompt === null && (
        <p className="line-clamp-2 text-[11px] text-destructive">{view.error}</p>
      )}
    </div>
  );
}

// Mouse-only click target (like the rows' overlay): tabIndex -1 keeps it out of the Tab
// order and mousedown-preventDefault keeps focus on <body> so the hotkeys keep firing.
function Pill({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
        selected
          ? 'border-primary/40 bg-card/70 text-foreground'
          : 'border-border/60 bg-card/40 text-muted-foreground',
      )}
    >
      {label}
    </button>
  );
}
