import { useCallback, useEffect, useState } from 'react';
import type { IncomingFeed } from '@/generated/IncomingFeed';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

const EMPTY: IncomingFeed = { items: [], errors: [] };

export interface IncomingView {
  feed: IncomingFeed;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  /** Turn the item into an inbox task and archive it. */
  toTask: (id: string) => Promise<void>;
}

/**
 * The Incoming feed: loaded once (cached, then a fresh poll) and kept live by the core's
 * `incoming` event. Mounted once in the app shell, so the nav badge and the page share it.
 */
export function useIncoming(): IncomingView {
  const [feed, setFeed] = useState<IncomingFeed>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      setFeed(await api.refreshIncoming());
    } catch (e) {
      setError(errorMessage(e, 'Could not refresh Incoming'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void api.getIncoming().then(setFeed);
    void refresh();
  }, [refresh]);

  useTauriEvent<IncomingFeed>('incoming', setFeed);

  // Poll when Blink comes to the front (e.g. after reading Slack or GitHub), so the list is
  // current when you look at it instead of up to a minute behind.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const archive = useCallback(async (id: string) => {
    setError('');
    try {
      setFeed(await api.archiveIncoming(id));
    } catch (e) {
      setError(errorMessage(e, 'Could not archive that item'));
    }
  }, []);

  const toTask = useCallback(async (id: string) => {
    setError('');
    try {
      await api.incomingToTask(id);
      setFeed((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== id),
      }));
    } catch (e) {
      setError(errorMessage(e, 'Could not turn that item into a task'));
    }
  }, []);

  return { feed, refreshing, error, refresh, archive, toTask };
}
