import { authHandlers } from './auth';
import { ideaHandlers } from './ideas';
import { settingsHandlers } from './settings';
import { taskHandlers } from './tasks';
import type { MockHandlers } from './types';
import { worktreeHandlers } from './worktrees';

/**
 * The browser fallback for the Tauri IPC: when the webview runs under plain Vite (no Tauri
 * host, e.g. `pnpm desktop`), every command is served by an in-memory stand-in so the UI is
 * developable without the Rust core. One file per feature; keep each handler honest about
 * what the real command does.
 */
const handlers: MockHandlers = {
  ...authHandlers,
  ...taskHandlers,
  ...ideaHandlers,
  ...settingsHandlers,
  ...worktreeHandlers,
};

export async function mockInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const handler = handlers[cmd];
  if (!handler) throw new Error(`Unknown command: ${cmd}`);
  return handler(args);
}
