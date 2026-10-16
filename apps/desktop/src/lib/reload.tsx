import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

type ReloadHandler = () => Promise<void> | void;

interface ReloadRegistry {
  register: (handler: { current: ReloadHandler }) => () => void;
  reloadAll: () => Promise<void>;
}

const ReloadContext = createContext<ReloadRegistry | null>(null);

/**
 * The app-wide manual reload (`g`). Background syncing keeps everything fresh on its own; `g`
 * is "fetch it all again now". Whatever is on screen registers what it can reload
 * ([`useReloadHandler`]) — the shell its feeds, the Worktrees page its list + PR status, the
 * sync indicator a server sync — and one `g` runs them all at once.
 */
export function ReloadProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Set<{ current: ReloadHandler }>());

  const register = useCallback((handler: { current: ReloadHandler }) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  // Each handler surfaces its own errors (its own spinner / error line); one failing source
  // must not stop the others, so every handler runs to completion.
  const reloadAll = useCallback(async () => {
    await Promise.allSettled([...handlers.current].map((handler) => handler.current()));
  }, []);

  return <ReloadContext.Provider value={{ register, reloadAll }}>{children}</ReloadContext.Provider>;
}

/** Register what this component can reload while it's mounted. The latest `handler` is used. */
export function useReloadHandler(handler: ReloadHandler) {
  const registry = useContext(ReloadContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => registry?.register(latest), [registry]);
}

/** Run every registered reload (what `g` does). */
export function useReloadAll(): () => Promise<void> {
  const registry = useContext(ReloadContext);
  if (registry === null) throw new Error('useReloadAll needs a <ReloadProvider>');
  return registry.reloadAll;
}
