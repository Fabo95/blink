import { Check, ExternalLink, Tag, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverAnchor } from '@/components/ui/popover';
import type { Task } from '@/generated/Task';
import { linkLabel } from '@/lib/link';
import { cn } from '@/lib/utils';
import { DeleteTaskPopover } from './DeleteTaskPopover';

interface TaskRowProps {
  task: Task;
  focused: boolean;
  editing: boolean;
  /** True while this row's delete-confirm popover is open. */
  confirmingDelete: boolean;
  /** The task's group name, shown as a chip (omitted while a group filter is active). */
  groupName?: string;
  /** In-flight state of the `p` prompt action for this row, shown as an inline chip. */
  promptStatus?: 'loading' | 'copied';
  onSelect: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  onOpenLink: (task: Task) => void;
  onCancelEdit: () => void;
  onCancelDelete: () => void;
  /** The editor's `PopoverContent`, rendered only while this row is being edited. */
  children?: ReactNode;
}

export function TaskRow({
  task,
  focused,
  editing,
  confirmingDelete,
  groupName,
  promptStatus,
  onSelect,
  onToggleComplete,
  onOpenLink,
  onCancelEdit,
  onCancelDelete,
  children,
}: TaskRowProps) {
  const done = task.status === 'done';
  const source = task.source.appName || task.source.appId;
  // The editor and the delete-confirm share the row's one popover — they're mutually
  // exclusive (you cancel one to open the other).
  const overlayOpen = editing || confirmingDelete;

  return (
    <Popover
      open={overlayOpen}
      onOpenChange={(open) => {
        if (open) return;
        if (editing) onCancelEdit();
        else if (confirmingDelete) onCancelDelete();
      }}
    >
      <PopoverAnchor asChild>
        <li
          data-task-id={task.id}
          className={cn(
            'group relative rounded-xl border border-border/60 bg-card/40 px-3.5 py-3 transition-colors',
            focused && 'border-primary/40 bg-card/70',
            editing && 'border-primary/40 bg-card/70 ring-2 ring-primary/30',
            confirmingDelete && 'border-destructive/50 bg-card/70 ring-2 ring-destructive/30',
          )}
        >
          {/* Whole-card click target: single-click selects (then ↵ completes), double-click
              completes. aria-hidden + tabIndex -1 keep it mouse-only (keyboard uses the
              cursor); mousedown-preventDefault keeps focus on <body> so nav keeps working. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(task)}
            onDoubleClick={() => onToggleComplete(task)}
            className="absolute inset-0 rounded-xl"
          />
          {focused && !overlayOpen && (
            <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
          )}
          {/* Content sits above the overlay but ignores pointer events, so clicks fall
              through to select — except the link chip, which re-enables its own. */}
          <div className="pointer-events-none relative flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'break-words text-sm font-medium leading-snug',
                  done && 'text-muted-foreground line-through',
                )}
              >
                {task.text}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  {source}
                </span>
                {task.link && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenLink(task)}
                      title={task.link}
                      className="pointer-events-auto relative inline-flex min-w-0 items-center gap-1 text-blink-bright transition hover:underline"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{linkLabel(task.link)}</span>
                    </button>
                  </>
                )}
                {groupName && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Tag className="size-3 shrink-0" />
                      {groupName}
                    </span>
                  </>
                )}
                {promptStatus && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">
                      ·
                    </span>
                    {promptStatus === 'loading' ? (
                      <span className="inline-flex items-center gap-1 text-blink-bright">
                        <WandSparkles className="size-3 shrink-0 animate-pulse" />
                        Generating prompt…
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-blink-success">
                        <Check className="size-3 shrink-0" />
                        Prompt copied
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </li>
      </PopoverAnchor>
      {editing && children}
      {confirmingDelete && <DeleteTaskPopover task={task} />}
    </Popover>
  );
}
