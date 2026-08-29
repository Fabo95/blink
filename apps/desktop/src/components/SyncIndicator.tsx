import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSyncState } from '@/hooks/useSyncState';

/**
 * A small top-right indicator of background sync: a subtle cloud when idle, a spinner
 * while a cycle runs (held briefly so a fast cycle is still noticeable), and an
 * amber glyph (error on hover) if the last cycle failed.
 */
export function SyncIndicator() {
  const { state, message } = useSyncState();
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (state === 'syncing') {
      setSpinning(true);
      return;
    }
    // A cycle can finish in well under a second; keep the spinner up a moment longer so
    // it's actually perceptible.
    const timer = setTimeout(() => setSpinning(false), 700);
    return () => clearTimeout(timer);
  }, [state]);

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

  if (spinning) {
    return (
      <span className="inline-flex" role="status" aria-label="Syncing" title="Syncing…">
        <RefreshCw className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
      </span>
    );
  }

  return (
    <span className="inline-flex" role="status" aria-label="Sync on" title="Synced">
      <Cloud className="size-3.5 text-muted-foreground/50" aria-hidden />
    </span>
  );
}
