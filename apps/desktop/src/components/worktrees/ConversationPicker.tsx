import { type ReactNode, useEffect, useRef } from 'react';
import type { ClaudeConversation } from '@/generated/ClaudeConversation';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

/** The new-worktree prompt's choice of how its Claude starts: fresh, or continuing one of the
 *  repo's recent conversations (from the main checkout or any worktree). `↑↓` moves the pick
 *  while the branch field keeps focus; rows are also clickable. `picked` -1 = fresh. The
 *  conversations scroll in a capped list (the popover would otherwise run off the window),
 *  and the pick is kept in view as `↑↓` moves it. */
export function ConversationPicker({
  conversations,
  picked,
  onPick,
}: {
  conversations: ClaudeConversation[];
  picked: number;
  onPick: (index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (picked < 0) {
      list.current?.scrollTo({ top: 0 });
      return;
    }
    list.current?.children[picked]?.scrollIntoView({ block: 'nearest' });
  }, [picked]);

  return (
    <div className="mt-3 space-y-0.5">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Claude starts with
      </p>
      <Row selected={picked === -1} onSelect={() => onPick(-1)}>
        <span className="text-foreground">A fresh conversation</span>
      </Row>
      <div ref={list} className="max-h-64 space-y-0.5 overflow-y-auto">
        {conversations.map((conversation, index) => (
          <Row
            key={conversation.sessionId}
            selected={picked === index}
            onSelect={() => onPick(index)}
          >
            <span className="line-clamp-2 text-foreground">{conversation.preview}</span>
            <span className="mt-0.5 block truncate text-muted-foreground">
              {conversation.fromMain
                ? `${conversation.origin} (main checkout)`
                : conversation.origin}
              {' · '}
              {timeAgo(conversation.updatedAt)}
            </span>
          </Row>
        ))}
      </div>
    </div>
  );
}

// Mouse-secondary like the other pickers: out of the Tab order, mousedown preventDefault keeps
// focus in the branch field.
function Row({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'block w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
        selected ? 'border-primary/40 bg-card/70' : 'border-transparent',
      )}
    >
      {children}
    </button>
  );
}
