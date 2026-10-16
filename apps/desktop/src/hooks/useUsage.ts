import { useCallback, useEffect, useState } from 'react';
import type { UsageRange } from '@/generated/UsageRange';
import type { UsageReport } from '@/generated/UsageReport';
import { api } from '@/lib/api';
import { useReloadHandler } from '@/lib/reload';
import { errorMessage } from '@/lib/utils';

export interface UsageView {
  /** The last report; kept while a new range loads so the page doesn't blank. */
  report: UsageReport | null;
  loading: boolean;
  error: string;
}

/** Claude Code usage for `range`, read from the transcripts on open, on range change and on `g`. */
export function useUsage(range: UsageRange): UsageView {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.getUsageReport(range));
    } catch (e) {
      setError(errorMessage(e, 'Could not read Claude Code usage'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);
  useReloadHandler(load);

  return { report, loading, error };
}
