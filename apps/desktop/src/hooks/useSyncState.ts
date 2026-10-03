import { useState } from 'react';
import { useTauriEvent } from '@/hooks/useTauriEvent';

export type SyncState = { state: 'idle' | 'syncing' | 'error'; message: string | null };

const IDLE: SyncState = { state: 'idle', message: null };

/**
 * Background sync activity, pushed from the Rust loop via the `sync-state` window
 * event (`syncing` while a cycle runs, then `idle` or `error`). Inert under the browser
 * mock, which has no real sync.
 */
export function useSyncState(): SyncState {
  const [sync, setSync] = useState<SyncState>(IDLE);

  useTauriEvent<SyncState>('sync-state', setSync);

  return sync;
}
