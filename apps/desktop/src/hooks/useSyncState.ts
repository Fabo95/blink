import { useEffect, useState } from 'react';
import { isTauri } from '@/lib/api';

export type SyncState = { state: 'idle' | 'syncing' | 'error'; message: string | null };

const IDLE: SyncState = { state: 'idle', message: null };

/**
 * Background sync activity, pushed from the Rust loop via the `sync-state` window
 * event (`syncing` while a cycle runs, then `idle` or `error`). Inert under the browser
 * mock, which has no real sync.
 */
export function useSyncState(): SyncState {
  const [sync, setSync] = useState<SyncState>(IDLE);

  useEffect(() => {
    if (!isTauri) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<SyncState>('sync-state', (event) => setSync(event.payload)).then((un) => {
        if (active) unlisten = un;
        else un();
      }),
    );
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return sync;
}
