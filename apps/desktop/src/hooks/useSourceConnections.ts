import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourceConnection } from '@/generated/SourceConnection';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';

export interface SourceConnectionsView {
  connections: SourceConnection[];
  /** A live check is running (the list keeps showing the last result meanwhile). */
  checking: boolean;
  error: string;
  /** Ask every source again who it's signed in as. */
  recheck: () => Promise<void>;
}

/**
 * Who each Incoming source is signed in as. Checking is a round-trip per source (GitHub's
 * `gh`, Linear, Slack), so it's done once at launch and kept here in the app shell — Settings
 * shows it instantly instead of re-asking on every visit. It re-checks on demand (`g`, a
 * connect/disconnect) and whenever Incoming's error lines change: a source starting or
 * stopping to fail (e.g. a revoked key) is exactly when the connection status may be stale.
 */
export function useSourceConnections(incomingErrors: string[]): SourceConnectionsView {
  const [connections, setConnections] = useState<SourceConnection[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const recheck = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      setConnections(await api.listSourceConnections());
    } catch (e) {
      setError(errorMessage(e, 'Could not check the sources'));
    } finally {
      setChecking(false);
    }
  }, []);

  // Runs on mount, then only when the set of failing sources actually changes — the feed
  // is re-emitted every minute, so compare by content, not by array identity.
  const errorsKey = incomingErrors.join('\n');
  const lastErrorsKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastErrorsKey.current === errorsKey) return;
    lastErrorsKey.current = errorsKey;
    void recheck();
  }, [errorsKey, recheck]);

  return { connections, checking, error, recheck };
}
