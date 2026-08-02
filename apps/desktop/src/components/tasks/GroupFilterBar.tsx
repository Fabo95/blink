import { useRef } from 'react';
import { DeleteGroupDialog } from '@/components/tasks/DeleteGroupDialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { TaskGroupsView } from '@/hooks/useTaskGroups';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

/**
 * The group filter above the inbox: an All pill plus one per group. Keyboard-only
 * management — `n` creates, `r` renames, `⌘⌫` deletes; switching (`←→`/`hl`) is bound in
 * TaskList and hinted in the footer statusline. The name prompt is a small popover opened
 * exclusively by those keys. Pills click-to-select (parity with rows), but carry no
 * management affordances.
 */
export function GroupFilterBar({ view }: { view: TaskGroupsView }) {
  const promptInputRef = useRef<HTMLInputElement>(null);
  // The name prompt's commands live here because the (uncontrolled) input does; the
  // `group-prompt` scope itself is activated by useTaskGroups.
  useShortcut('groupPrompt.submit', {
    enabled: view.prompt !== null,
    callback: () => void view.submitPrompt(promptInputRef.current?.value ?? ''),
  });
  useShortcut('groupPrompt.cancel', { enabled: view.prompt !== null, callback: view.closePrompt });

  return (
    <div className="space-y-1.5">
      <Popover open={view.prompt !== null} onOpenChange={(open) => !open && view.closePrompt()}>
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
              {view.prompt === 'rename' ? 'Rename group' : 'New group'}
            </p>
            <Input
              ref={promptInputRef}
              autoFocus
              defaultValue={view.prompt === 'rename' ? (view.selected?.name ?? '') : ''}
              placeholder="Group name"
              className="h-8 text-sm"
            />
            {view.error && (
              <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{view.error}</p>
            )}
          </PopoverContent>
        )}
      </Popover>
      {view.error && view.prompt === null && (
        <p className="line-clamp-2 text-[11px] text-destructive">{view.error}</p>
      )}
      <DeleteGroupDialog
        group={view.deleting ? view.selected : null}
        onOpenChange={(open) => !open && view.cancelDelete()}
      />
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
