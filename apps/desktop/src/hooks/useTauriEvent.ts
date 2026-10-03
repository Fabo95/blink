import { useEffect, useRef } from 'react';
import { isTauri } from '@/lib/api';

/**
 * Run `handler` whenever the Rust core emits one of `events` (e.g. `records-merged` after a
 * sync pull). Inert under the browser mock, which has no Tauri host. The handler is kept
 * fresh through a ref, so callers can pass an inline function without re-subscribing; the
 * subscription itself only changes when the event names do.
 */
export function useTauriEvent<T = unknown>(
  events: string | string[],
  handler: (payload: T) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  // A stable key, so a fresh array literal per render doesn't resubscribe.
  const key = Array.isArray(events) ? events.join('\n') : events;

  useEffect(() => {
    if (!isTauri) return;
    const unlisteners: (() => void)[] = [];
    let active = true;
    void import('@tauri-apps/api/event').then(({ listen }) => {
      for (const name of key.split('\n')) {
        void listen<T>(name, (event) => {
          if (active) handlerRef.current(event.payload);
        }).then((unlisten) => {
          // The effect may have been torn down while `listen` was still resolving.
          if (active) unlisteners.push(unlisten);
          else unlisten();
        });
      }
    });
    return () => {
      active = false;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [key]);
}
