import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AiStatus {
  /** Whether a stored API key enables the AI features — every AI action gates on this. */
  enabled: boolean;
  /** Re-read the status from the core; call after saving or clearing the key. */
  refresh: () => Promise<void>;
}

const AiStatusContext = createContext<AiStatus | null>(null);

/**
 * One per window (like `ShortcutProvider`), so both the main app and the capture
 * windows can gate their AI actions. The key itself never enters the webview — this
 * only tracks whether one is set.
 */
export function AiStatusProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEnabled(await api.aiStatus());
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AiStatusContext.Provider value={{ enabled, refresh }}>{children}</AiStatusContext.Provider>;
}

export function useAiStatus(): AiStatus {
  const ctx = useContext(AiStatusContext);
  if (ctx === null) throw new Error('useAiStatus must be used within an AiStatusProvider');
  return ctx;
}
