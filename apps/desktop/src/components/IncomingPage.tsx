import { Bell } from 'lucide-react';
import { useState } from 'react';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState, ErrorLine, Section } from '@/components/ui/section';
import type { IncomingItem } from '@/generated/IncomingItem';
import type { IncomingView } from '@/hooks/useIncoming';
import { useListCursor } from '@/hooks/useListCursor';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { SOURCES } from '@/lib/sources';
import { timeAgo } from '@/lib/timeAgo';
import { errorMessage } from '@/lib/utils';

/**
 * The Incoming page: what external sources want from you right now (GitHub, Slack, Linear,
 * Better Stack, …), newest first, one row shape for all of them. Keyboard-only like the inbox:
 * `↑↓`/`jk` cursor, `o` opens the item at its source, `m` moves it to the inbox as a task,
 * `a` archives it (hidden until it changes). The app-wide `g` polls every source now.
 * Nothing is ever marked read at the source.
 */
export function IncomingPage({
  incoming,
  helpOpen,
  onTaskCreated,
}: {
  incoming: IncomingView;
  helpOpen: boolean;
  onTaskCreated: () => void;
}) {
  const { items, errors } = incoming.feed;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = !helpOpen;
  const cursor = useListCursor(items, (item) => item.id, { enabled });
  const focused = cursor.focused;

  const openItem = async (item: IncomingItem) => {
    setError('');
    try {
      await api.openLink(item.url);
    } catch (e) {
      setError(errorMessage(e, 'Could not open the item'));
    }
  };

  useShortcut('incoming.open', {
    enabled: enabled && focused !== null,
    callback: () => {
      if (focused) void openItem(focused);
    },
  });
  useShortcut('incoming.task', {
    enabled: enabled && focused !== null,
    callback: () => {
      if (!focused) return;
      const item = focused;
      cursor.advance();
      void incoming.toTask(item.id).then(() => {
        setNotice(`Added to the inbox: ${item.title}`);
        onTaskCreated();
      });
    },
  });
  useShortcut('incoming.archive', {
    enabled: enabled && focused !== null,
    callback: () => {
      if (!focused) return;
      cursor.advance();
      void incoming.archive(focused.id);
    },
  });

  const problems = [...errors, ...[incoming.error, error].filter(Boolean)];

  return (
    <Section title="Incoming" count={items.length} busy={incoming.refreshing}>
      {items.length === 0 ? (
        <EmptyState icon={Bell}>
          {incoming.refreshing ? 'Checking your sources…' : 'Nothing waiting on you.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <IncomingRow
                item={item}
                focused={cursor.focusedId === item.id}
                onSelect={() => cursor.setFocusedId(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{notice}</p>}
      {problems.length > 0 && (
        <div className="mt-2 space-y-1">
          {problems.map((message) => (
            <ErrorLine key={message}>{message}</ErrorLine>
          ))}
        </div>
      )}
    </Section>
  );
}

function IncomingRow({
  item,
  focused,
  onSelect,
}: {
  item: IncomingItem;
  focused: boolean;
  onSelect: () => void;
}) {
  const source = SOURCES[item.source];
  const Icon = source.icon;
  return (
    <ListRow state={focused ? 'focused' : 'idle'} onSelect={onSelect}>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 shrink-0">
          <Icon className="block size-4 text-foreground" />
          {item.urgent && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-card" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            {source.name} · {item.context} · {timeAgo(item.updatedAt)}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-blink-bright">{item.reason}</span>
      </div>
    </ListRow>
  );
}
