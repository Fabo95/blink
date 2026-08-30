import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AiStatus {
  /** Whether a stored API key enables the AI features — every AI action gates on this. */
  enabled: boolean;
  /** Masked preview of the stored key (`sk-…YxkA`), or `null` when none is set. */
  keyHint: string | null;
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
  const [keyHint, setKeyHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setKeyHint(await api.aiStatus());
    } catch {
      setKeyHint(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-check when the window regains focus — covers a capture window that was open
    // (hidden) while the key was set/cleared in the main window.
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return (
    <AiStatusContext.Provider value={{ enabled: keyHint !== null, keyHint, refresh }}>
      {children}
    </AiStatusContext.Provider>
  );
}

export function useAiStatus(): AiStatus {
  const ctx = useContext(AiStatusContext);
  if (ctx === null) throw new Error('useAiStatus must be used within an AiStatusProvider');
  return ctx;
}
