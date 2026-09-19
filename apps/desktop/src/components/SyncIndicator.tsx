import { useCallback, useEffect, useState } from 'react';
import { useSyncState } from '@/hooks/useSyncState';
import { api, isTauri } from '@/lib/api';
import { useShortcut } from '@/lib/shortcuts/useShortcut';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'syncing' | 'error';

const LABEL: Record<Status, string> = {
  idle: 'Synced',
  syncing: 'Syncing',
  error: 'Sync failed',
};

const DOT: Record<Status, string> = {
  idle: 'bg-blink-success',
  syncing: 'bg-blink-bright',
  error: 'bg-amber-500',
};

/**
 * The header's background-sync status: a calm green dot when up to date, a pulsing violet
 * dot while a cycle runs (held briefly so a fast cycle still registers), and an amber dot
 * with the failure reason on hover when the last cycle failed. Hidden under the browser
 * mock, which has no local core to sync.
 *
 * It's also the manual trigger — `⌘⇧s`, or a click on the indicator as the secondary mouse
 * affordance. Worth having because the background pull backs off to two minutes when
 * nothing's changing, so a task captured elsewhere (`POST /v1/capture`) can sit that long
 * before it lands.
 */
export function SyncIndicator() {
  const { state, message } = useSyncState();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (state === 'syncing') {
      setActive(true);
      return;
    }
    // A cycle can finish in well under a second; hold the active state a moment so it stays
    // perceptible instead of flashing.
    const timer = setTimeout(() => setActive(false), 700);
    return () => clearTimeout(timer);
  }, [state]);

  const syncNow = useCallback(() => {
    if (state === 'syncing') return;
    // Fire-and-forget: the command only signals the background loop, and the loop reports
    // what happened through the `sync-state` events this component already renders.
    void api.syncNow();
  }, [state]);

  // Enabled regardless of sync state — `enabled` also gates the statusline chip, so
  // gating on "syncing" would blink ⌘⇧s out of the bar on every cycle. The no-op guard
  // above handles the in-flight case instead.
  useShortcut('app.sync', { enabled: isTauri, callback: syncNow });

  if (!isTauri) return null;

  const status: Status = state === 'error' ? 'error' : active ? 'syncing' : 'idle';

  return (
    <span
      role="status"
      aria-label={LABEL[status]}
      title={status === 'error' ? (message ?? 'Sync failed') : undefined}
      // Secondary mouse affordance, like a task row's click-to-select: out of the focus
      // flow so it never competes with the cursor, and no pointer cursor (the app uses one
      // cursor everywhere). The keyboard path is ⌘⇧s.
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={syncNow}
      className={cn(
        'inline-flex select-none items-center gap-1.5 text-xs text-muted-foreground/70',
        status === 'error' && 'pointer-events-auto cursor-help text-amber-500/90',
      )}
    >
      <span className="relative flex size-1.5">
        {status === 'syncing' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blink-bright opacity-75" />
        )}
        <span className={cn('relative inline-flex size-1.5 rounded-full', DOT[status])} aria-hidden />
      </span>
      {LABEL[status]}
    </span>
  );
}
