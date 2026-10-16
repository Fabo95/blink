import { KeyRound, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { IconComponent } from '@/components/ui/brand-icons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { ErrorLine, FIELD_LABEL, SECTION_TITLE } from '@/components/ui/section';
import type { SourceAccount } from '@/generated/SourceAccount';
import { useAiStatus } from '@/hooks/useAiStatus';
import { useListCursor } from '@/hooks/useListCursor';
import type { SourceConnectionsView } from '@/hooks/useSourceConnections';
import { api } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { SOURCES } from '@/lib/sources';
import { cn, errorMessage } from '@/lib/utils';

/** One connection row, whatever it is (an Incoming source or the OpenAI key). */
interface Connection {
  id: string;
  name: string;
  icon: IconComponent;
  /** Blink keeps its key (set/replace/remove here) vs. signed in elsewhere (`gh`). */
  keyed: boolean;
  connected: boolean;
  account: SourceAccount | null;
  /** The subline when there's no profile to show. */
  detail: string;
  credentialHint: string | null;
  problem: string | null;
  keyPlaceholder: string;
  keyHelp: string;
  connect: (key: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Everything Blink is connected to, as one list of identical rows: the Incoming sources
 * (GitHub, Linear, Slack) and the OpenAI key behind the AI actions. Each row shows who it's
 * signed in as (avatar, name, handle · organization), whether it works (`connected` /
 * `problem` / `off`), and how (`gh CLI`, or a glimpse of the key). Keyboard-only like the
 * lists: `↑↓` picks a row; on one whose key Blink keeps, `e` sets or replaces the key and
 * `⌫` removes it — both in-row popovers (`⌘↵` confirm, `Esc` cancel), and a key is always
 * checked before it's kept. The source connections come from the shell (checked at launch,
 * again on the app-wide `g`).
 */
export function ConnectionsCard({
  sources,
  onSourcesChanged,
  enabled,
}: {
  sources: SourceConnectionsView;
  onSourcesChanged: () => void;
  /** False while the cheat-sheet is up — the list keys stand down. */
  enabled: boolean;
}) {
  const ai = useAiStatus();
  const [overlay, setOverlay] = useState<{ kind: 'key' | 'remove'; id: string } | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connections: Connection[] = [
    ...sources.connections.map((connection) => {
      const meta = SOURCES[connection.source];
      const afterChange = async () => {
        await sources.recheck();
        onSourcesChanged();
      };
      return {
        id: connection.source,
        name: meta.name,
        icon: meta.icon,
        keyed: connection.auth === 'apiKey',
        connected: connection.connected,
        account: connection.account,
        detail: connection.problem ?? 'Not connected',
        credentialHint:
          connection.credentialHint ?? (connection.auth === 'ghCli' ? 'gh CLI' : null),
        problem: connection.problem,
        keyPlaceholder: meta.keyPlaceholder ?? 'API key',
        keyHelp: meta.keyHelp ?? '',
        connect: async (value: string) => {
          await api.connectSource(connection.source, value);
          await afterChange();
        },
        disconnect: async () => {
          await api.disconnectSource(connection.source);
          await afterChange();
        },
      };
    }),
    {
      id: 'openai',
      name: 'OpenAI',
      icon: Sparkles,
      keyed: true,
      connected: ai.enabled,
      account: null,
      detail: ai.enabled ? 'Powers improve (⌘i) and prompt (p)' : 'No API key — AI actions are off',
      credentialHint: ai.keyHint,
      problem: null,
      keyPlaceholder: 'sk-…',
      keyHelp: 'Your own OpenAI API key — tested against OpenAI before it’s kept.',
      connect: async (value: string) => {
        await api.setAiApiKey(value);
        await ai.refresh();
      },
      disconnect: async () => {
        await api.clearAiApiKey();
        await ai.refresh();
      },
    },
  ];

  const browsing = enabled && overlay === null;
  const cursor = useListCursor(connections, (c) => c.id, { enabled: browsing });
  const focused = cursor.focused;
  const target = connections.find((c) => c.id === overlay?.id) ?? null;

  const close = () => {
    setOverlay(null);
    setKey('');
    setError('');
  };

  const run = async (action: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      close();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  useShortcut('connections.edit', {
    enabled: browsing && focused?.keyed === true,
    callback: () => focused && setOverlay({ kind: 'key', id: focused.id }),
  });
  useShortcut('connections.remove', {
    enabled: browsing && focused?.keyed === true && focused.connected,
    callback: () => focused && setOverlay({ kind: 'remove', id: focused.id }),
  });
  useShortcut('connectionKey.save', {
    enabled: overlay?.kind === 'key' && key.trim().length > 0 && !busy,
    callback: () => {
      if (target) void run(() => target.connect(key.trim()), 'That key didn’t work');
    },
  });
  useShortcut('connectionKey.cancel', { enabled: overlay?.kind === 'key', callback: close });
  useShortcut('connectionRemove.confirm', {
    enabled: overlay?.kind === 'remove' && !busy,
    callback: () => {
      if (target) void run(() => target.disconnect(), 'Could not remove the key');
    },
  });
  useShortcut('connectionRemove.cancel', { enabled: overlay?.kind === 'remove', callback: close });

  return (
    <Card className="panel">
      <CardHeader>
        <span className={`${SECTION_TITLE} flex items-center gap-2`}>
          Connections
          {sources.checking && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {connections.map((connection) => {
            const open = overlay?.id === connection.id ? overlay : null;
            const state = open
              ? open.kind === 'remove'
                ? 'confirming'
                : 'editing'
              : cursor.focusedId === connection.id
                ? 'focused'
                : 'idle';
            return (
              <li key={connection.id}>
                <Popover
                  open={open !== null}
                  onOpenChange={(next) => {
                    if (!next) close();
                  }}
                >
                  <PopoverAnchor asChild>
                    <ListRow state={state} onSelect={() => cursor.setFocusedId(connection.id)}>
                      <ConnectionLine connection={connection} />
                    </ListRow>
                  </PopoverAnchor>
                  {open?.kind === 'key' && (
                    <PopoverContent align="start" sideOffset={8} className="w-96 p-3">
                      <p className={cn(FIELD_LABEL, 'mb-2')}>
                        {connection.connected ? 'Replace' : 'Set'} {connection.name} key
                      </p>
                      <div className="flex h-8 items-center gap-2 rounded-md border border-input px-2 focus-within:ring-1 focus-within:ring-ring">
                        <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                        <Input
                          // biome-ignore lint/a11y/noAutofocus: keyboard-first — land in the key field
                          autoFocus
                          type="password"
                          value={key}
                          onChange={(e) => setKey(e.target.value)}
                          placeholder={connection.keyPlaceholder}
                          className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {busy ? (
                          'Checking the key…'
                        ) : error ? (
                          <ErrorLine>{error}</ErrorLine>
                        ) : (
                          `${connection.keyHelp} Kept in your keychain, never shown again.`
                        )}
                      </div>
                    </PopoverContent>
                  )}
                  {open?.kind === 'remove' && (
                    <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
                      <p className="text-sm font-medium">Remove the {connection.name} key?</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        It's deleted from your keychain
                        {connection.id === 'openai'
                          ? ' and the AI actions turn off.'
                          : ' and its items leave Incoming.'}
                      </p>
                      {error && (
                        <div className="mt-1">
                          <ErrorLine>{error}</ErrorLine>
                        </div>
                      )}
                    </PopoverContent>
                  )}
                </Popover>
              </li>
            );
          })}
        </ul>
        {sources.error && overlay === null && (
          <div className="mt-2">
            <ErrorLine>{sources.error}</ErrorLine>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionLine({ connection }: { connection: Connection }) {
  const { account } = connection;
  // A stored key Blink couldn't verify is a problem; no key at all is just "off".
  const status = connection.connected
    ? 'connected'
    : connection.problem && connection.credentialHint
      ? 'problem'
      : 'off';
  return (
    <div className="flex items-center gap-3">
      <Avatar
        url={account?.avatarUrl ?? null}
        name={account?.name ?? null}
        icon={connection.icon}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {connection.name}
          {account && (
            <span className="truncate font-normal text-muted-foreground">· {account.name}</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {account
            ? [account.handle, account.organization].filter(Boolean).join(' · ')
            : connection.detail}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <StatusDot status={status} />
        {connection.credentialHint && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {connection.credentialHint}
          </span>
        )}
      </div>
    </div>
  );
}

/** `connected` (green) / `problem` (red: a key that stopped working) / `off` (grey). */
function StatusDot({ status }: { status: 'connected' | 'problem' | 'off' }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-medium',
        status === 'connected' && 'text-blink-success',
        status === 'problem' && 'text-destructive',
        status === 'off' && 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'connected' && 'bg-blink-success',
          status === 'problem' && 'bg-destructive',
          status === 'off' && 'bg-muted-foreground/40',
        )}
      />
      {status}
    </span>
  );
}

/** The account's avatar, else its initials, else the connection's icon. */
function Avatar({
  url,
  name,
  icon: Icon,
}: {
  url: string | null;
  name: string | null;
  icon: IconComponent;
}) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className="size-8 shrink-0 rounded-full border border-border/60 object-cover"
      />
    );
  }
  const initials = name
    ?.split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-[11px] font-semibold text-muted-foreground">
      {initials || <Icon className="size-3.5" />}
    </span>
  );
}
