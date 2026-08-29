import { useEffect, useState } from 'react';
import { useSyncState } from '@/hooks/useSyncState';
import { isTauri } from '@/lib/api';
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

  if (!isTauri) return null;

  const status: Status = state === 'error' ? 'error' : active ? 'syncing' : 'idle';

  return (
    <span
      role="status"
      aria-label={LABEL[status]}
      title={status === 'error' ? (message ?? 'Sync failed') : undefined}
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
