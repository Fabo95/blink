import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { CaptureSource } from '@/generated/CaptureSource';
import type { NewTask } from '@/generated/NewTask';
import type { Task } from '@/generated/Task';

/**
 * Typed façade over the Tauri IPC boundary. Each method maps to a `#[tauri::command]`
 * in `src-tauri/src/commands/`. When the frontend runs under plain Vite (no
 * Tauri host, e.g. `pnpm --filter @blink/desktop dev` in a browser), we fall back
 * to an in-memory mock so the UI is still developable without the Rust core.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** A way to capture a task; each has its own global hotkey and window. */
export type CaptureMethod = 'copy' | 'manual';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
  }
  return mockInvoke<T>(cmd, args);
}

export const api = {
  /** Copy-capture: read the clipboard + system metadata, run the DLP filter, return a draft. */
  readCopyCapture: () => invoke<CaptureDraft>('read_copy_capture'),
  listTasks: () => invoke<Task[]>('list_tasks'),
  saveTask: (task: NewTask) => invoke<Task>('save_task', { task }),
  deleteTask: (id: string) => invoke<void>('delete_task', { id }),
  /** Swap the inbox order of two tasks (move one past the other). */
  reorderTask: (first: string, second: string) =>
    invoke<void>('reorder_task', { first, second }),
  updateTask: (
    id: string,
    patch: { text?: string; completed?: boolean; link?: string; source?: string; improved?: boolean },
  ) =>
    invoke<Task>('update_task', {
      id,
      text: patch.text,
      completed: patch.completed,
      link: patch.link,
      source: patch.source,
      improved: patch.improved,
    }),
  /** Optimize a saved task's text with AI and persist it, marking it improved. */
  improveTask: (id: string, text: string) => invoke<Task>('improve_task', { id, text }),
  /** Open a task's link in the default browser (http/https only). */
  openLink: (url: string) => invoke<void>('open_link', { url }),
  /** Close the copy-capture panel and return focus to the previous app. */
  dismissCopyCapture: () => invoke<void>('dismiss_copy_capture'),
  /** Close the manual-capture panel and return focus to the previous app. */
  dismissManualCapture: () => invoke<void>('dismiss_manual_capture'),
  /** Ask OpenAI to improve raw captured text (returns the cleaned text). */
  improveText: (text: string) => invoke<string>('improve_text', { text }),
  /** The current global hotkey for a capture method (Tauri accelerator syntax). */
  getCaptureShortcut: (method: CaptureMethod) =>
    invoke<string>('get_capture_shortcut', { method }),
  /** Bind a new hotkey for a capture method; rejects if invalid or already in use. */
  setCaptureShortcut: (method: CaptureMethod, shortcut: string) =>
    invoke<void>('set_capture_shortcut', { method, shortcut }),
};

// --- Browser fallback -------------------------------------------------------

// Seed the browser mock (no Tauri host) with a spread of tasks so the inbox,
// last-24h Completed card, and day-grouped Archive are all visible in `pnpm desktop`.
function seedMockStore(): Task[] {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
  const source = (appName: string, windowTitle: string): CaptureSource => ({
    appId: appName.toLowerCase(),
    appName,
    windowTitle,
    capturedAt: hoursAgo(200),
  });
  const done = (
    text: string,
    completedHoursAgo: number,
    src: CaptureSource,
    link: string | null = null,
  ): Task => ({
    id: crypto.randomUUID(),
    text,
    status: 'done',
    improved: false,
    link,
    source: src,
    createdAt: hoursAgo(completedHoursAgo + 4),
    updatedAt: hoursAgo(completedHoursAgo),
    completedAt: hoursAgo(completedHoursAgo),
  });
  const active = (text: string, src: CaptureSource, link: string | null = null): Task => ({
    id: crypto.randomUUID(),
    text,
    status: 'inbox',
    improved: false,
    link,
    source: src,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    completedAt: null,
  });

  const slack = source('Slack', '#engineering');
  const chrome = source('Chrome', 'Linear — BLK-142');
  const notion = source('Notion', 'Roadmap Q3');
  const mail = source('Mail', 'Re: contract review');

  return [
    // Inbox (active)
    active('Draft the sync-server auth middleware', chrome, 'https://linear.app/blink/issue/BLK-142'),
    active('Reply to the security questionnaire', mail),
    // Completed in the last 24h → Completed card
    done('Ship the archive view', 3, chrome),
    done('Review DLP ruleset PR', 10, slack, 'https://github.com/blink/desktop/pull/88'),
    // Older → Archive, grouped by day (>8 so pagination shows)
    done('Fix aurora animation jank', 30, notion),
    done('Wire up manual-capture window', 34, slack),
    done('Add completed_at migration', 52, chrome),
    done('Redesign the task-row actions', 58, slack),
    done('Rename copy-capture everywhere', 76, notion),
    done('Extract the useListCursor hook', 80, chrome),
    done('Add optional link to tasks', 100, mail, 'https://linear.app/blink/issue/BLK-88'),
    done('Set up SQLCipher keychain key', 122, slack),
    done('Expand the DLP ruleset', 146, notion),
    done('Wire the global-shortcut plugin', 170, chrome),
    done('Sketch the dark-violet theme', 200, notion),
    done('Draft the zero-knowledge sync spec', 210, mail),
    done('Bootstrap the Tauri v2 shell', 220, chrome, 'https://tauri.app'),
  ];
}

const mockStore: Task[] = seedMockStore();
const mockShortcuts: Record<CaptureMethod, string> = {
  copy: 'CommandOrControl+Shift+B',
  manual: 'CommandOrControl+Shift+M',
};

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'read_copy_capture': {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = ''; // no permission / empty clipboard in the browser
      }
      const { clean, count } = mockSanitize(text);
      const draft: CaptureDraft = {
        text: clean,
        originalLength: text.length,
        redactionCount: count,
        source: {
          appId: 'clipboard',
          appName: 'Clipboard',
          windowTitle: 'Copied text',
          capturedAt: new Date().toISOString(),
        },
        link: null,
      };
      return draft as T;
    }

    case 'list_tasks':
      return [...mockStore] as T;
    case 'save_task': {
      const input = args?.task as NewTask;
      const now = new Date().toISOString();
      const task: Task = {
        id: crypto.randomUUID(),
        text: input.text,
        status: 'inbox',
        improved: input.improved,
        link: input.link,
        source: input.source,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      mockStore.unshift(task);
      return task as T;
    }
    case 'improve_task': {
      const task = mockStore.find((t) => t.id === args?.id);
      if (!task) throw new Error('task not found');
      // Browser mock can't reach OpenAI — just flag it improved.
      task.improved = true;
      task.updatedAt = new Date().toISOString();
      return task as T;
    }
    case 'delete_task': {
      const idx = mockStore.findIndex((t) => t.id === args?.id);
      if (idx >= 0) mockStore.splice(idx, 1);
      return undefined as T;
    }
    case 'reorder_task': {
      const a = mockStore.findIndex((t) => t.id === args?.first);
      const b = mockStore.findIndex((t) => t.id === args?.second);
      if (a >= 0 && b >= 0) {
        [mockStore[a], mockStore[b]] = [mockStore[b], mockStore[a]];
      }
      return undefined as T;
    }
    case 'update_task': {
      const task = mockStore.find((t) => t.id === args?.id);
      if (!task) throw new Error('task not found');
      const nextText = args?.text;
      const nextCompleted = args?.completed;
      const nextLink = args?.link;
      const nextSource = args?.source;
      const nextImproved = args?.improved;
      if (typeof nextText === 'string') {
        task.text = nextText;
      }
      if (typeof nextImproved === 'boolean') {
        task.improved = nextImproved;
      }
      if (typeof nextCompleted === 'boolean') {
        task.status = nextCompleted ? 'done' : 'inbox';
        task.completedAt = nextCompleted ? new Date().toISOString() : null;
      }
      if (typeof nextLink === 'string') {
        task.link = nextLink.trim() ? nextLink.trim() : null;
      }
      if (typeof nextSource === 'string') {
        task.source = { ...task.source, appName: nextSource };
      }
      task.updatedAt = new Date().toISOString();
      return task as T;
    }
    case 'dismiss_copy_capture':
    case 'dismiss_manual_capture':
      return undefined as T;
    case 'improve_text':
      // Browser mock can't reach OpenAI — echo the input back.
      return String(args?.text ?? '') as T;
    case 'open_link':
      window.open(String(args?.url ?? ''), '_blank', 'noopener');
      return undefined as T;
    case 'get_capture_shortcut':
      return mockShortcuts[args?.method === 'manual' ? 'manual' : 'copy'] as T;
    case 'set_capture_shortcut': {
      const method: CaptureMethod = args?.method === 'manual' ? 'manual' : 'copy';
      mockShortcuts[method] = String(args?.shortcut ?? '');
      return undefined as T;
    }
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

function mockSanitize(text: string): { clean: string; count: number } {
  let count = 0;
  const clean = text.replace(/\b(?:sk|pk)_[a-z]+_[A-Za-z0-9]+\b/g, () => {
    count += 1;
    return '[REDACTED_API_KEY]';
  });
  return { clean, count };
}

export { isTauri };
