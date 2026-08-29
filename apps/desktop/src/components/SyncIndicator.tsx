import { CloudOff, RefreshCw } from 'lucide-react';
import { useSyncState } from '@/hooks/useSyncState';

/**
 * A small top-right indicator of background sync activity: a spinner while a cycle is
 * running, a muted-amber glyph (with the error on hover) if the last cycle failed, and
 * nothing when idle — so it stays out of the way until there's something to show.
 */
export function SyncIndicator() {
  const { state, message } = useSyncState();

  if (state === 'syncing') {
    return (
      <RefreshCw
        className="size-3.5 animate-spin text-muted-foreground"
        aria-label="Syncing"
        role="status"
      />
    );
  }
  if (state === 'error') {
    return (
      <span
        className="inline-flex"
        role="status"
        aria-label="Sync failed"
        title={message ?? 'Sync failed'}
      >
        <CloudOff className="size-3.5 text-amber-500" aria-hidden />
      </span>
    );
  }
  return null;
}
