import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { NewTask } from '@/generated/NewTask';
import type { SanitizeResult } from '@/generated/SanitizeResult';
import type { Task } from '@/generated/Task';

/**
 * Typed façade over the Tauri IPC boundary. Each method maps to a `#[tauri::command]`
 * in `src-tauri/src/commands/`. When the frontend runs under plain Vite (no
 * Tauri host, e.g. `pnpm --filter @blink/desktop dev` in a browser), we fall back
 * to an in-memory mock so the UI is still developable without the Rust core.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
  }
  return mockInvoke<T>(cmd, args);
}

export const api = {
  /** Read the clipboard + system metadata, run the DLP filter, return a draft. */
  captureFromClipboard: () => invoke<CaptureDraft>('capture_from_clipboard'),
  /** Run the local security filter over arbitrary text (live preview in the UI). */
  sanitizeText: (text: string) => invoke<SanitizeResult>('sanitize_text', { text }),
  listTasks: () => invoke<Task[]>('list_tasks'),
  saveTask: (task: NewTask) => invoke<Task>('save_task', { task }),
  deleteTask: (id: string) => invoke<void>('delete_task', { id }),
  /** Optimize a saved task's text with AI and persist it, marking it improved. */
  improveTask: (id: string, text: string) => invoke<Task>('improve_task', { id, text }),
  /** Close the quick-capture panel and return focus to the previous app. */
  dismissCapture: () => invoke<void>('dismiss_capture'),
  /** Ask OpenAI to improve raw captured text (returns the cleaned text). */
  improveText: (text: string) => invoke<string>('improve_text', { text }),
};

// --- Browser fallback -------------------------------------------------------

const mockStore: Task[] = [];

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'capture_from_clipboard': {
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
      };
      return draft as T;
    }
    case 'sanitize_text': {
      const { clean, count } = mockSanitize(String(args?.text ?? ''));
      return { clean, redactionCount: count, matched: [] } as T;
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
        source: input.source,
        createdAt: now,
        updatedAt: now,
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
    case 'dismiss_capture':
      return undefined as T;
    case 'improve_text':
      // Browser mock can't reach OpenAI — echo the input back.
      return String(args?.text ?? '') as T;
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
