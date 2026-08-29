import type { AuthResult } from '@/generated/AuthResult';
import type { AuthUser } from '@/generated/AuthUser';
import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { CaptureSource } from '@/generated/CaptureSource';
import type { NewTask } from '@/generated/NewTask';
import type { NewTaskGroup } from '@/generated/NewTaskGroup';
import type { Task } from '@/generated/Task';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { VaultStatus } from '@/generated/VaultStatus';

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
  signIn: (email: string, password: string) => invoke<AuthResult>('sign_in', { email, password }),
  signUp: (email: string, password: string, name: string) =>
    invoke<AuthResult>('sign_up', { email, password, name }),
  verifyEmail: (email: string, otp: string) => invoke<void>('verify_email', { email, otp }),
  resendVerification: (email: string) => invoke<void>('resend_verification', { email }),
  requestPasswordReset: (email: string) => invoke<void>('request_password_reset', { email }),
  resetPassword: (email: string, otp: string, password: string) =>
    invoke<void>('reset_password', { email, otp, password }),
  signOut: () => invoke<void>('sign_out'),
  currentSession: () => invoke<AuthUser | null>('current_session'),
  readCopyCapture: () => invoke<CaptureDraft>('read_copy_capture'),
  listTasks: () => invoke<Task[]>('list_tasks'),
  saveTask: (task: NewTask) => invoke<Task>('save_task', { task }),
  deleteTask: (id: string) => invoke<void>('delete_task', { id }),
  reorderTask: (first: string, second: string) => invoke<void>('reorder_task', { first, second }),
  updateTask: (
    id: string,
    patch: {
      text?: string;
      completed?: boolean;
      link?: string;
      source?: string;
      improved?: boolean;
      /** New group id; an empty string un-groups the task. */
      taskGroupId?: string;
    },
  ) =>
    invoke<Task>('update_task', {
      id,
      text: patch.text,
      completed: patch.completed,
      link: patch.link,
      source: patch.source,
      improved: patch.improved,
      taskGroupId: patch.taskGroupId,
    }),
  listTaskGroups: () => invoke<TaskGroup[]>('list_task_groups'),
  createTaskGroup: (group: NewTaskGroup) => invoke<TaskGroup>('create_task_group', { group }),
  /** Patch a group's mutable fields. Send only what changed; an empty-string `context`
   *  clears the group's context (the guidance folded into AI prompts for its tasks). */
  updateTaskGroup: (id: string, patch: { name?: string; context?: string }) =>
    invoke<TaskGroup>('update_task_group', { id, name: patch.name, context: patch.context }),
  /** Delete a group — its tasks fall back to ungrouped. */
  deleteTaskGroup: (id: string) => invoke<void>('delete_task_group', { id }),
  /** The inbox's active group filter, shared with the capture windows. */
  getActiveTaskGroup: () => invoke<string | null>('get_active_task_group'),
  setActiveTaskGroup: (taskGroupId: string | null) =>
    invoke<void>('set_active_task_group', { taskGroupId }),
  /** Open a task's link in the default browser (http/https only). */
  openLink: (url: string) => invoke<void>('open_link', { url }),
  /** Close the copy-capture panel and return focus to the previous app. */
  dismissCopyCapture: () => invoke<void>('dismiss_copy_capture'),
  /** Close the manual-capture panel and return focus to the previous app. */
  dismissManualCapture: () => invoke<void>('dismiss_manual_capture'),
  /** Ask OpenAI to improve raw captured text (returns the cleaned text). */
  improveText: (text: string) => invoke<string>('improve_text', { text }),
  /** Generate a ready-to-paste assistant prompt from a task's raw text and copy it to
   *  the clipboard (returns the prompt). */
  generateTaskPrompt: (id: string) => invoke<string>('generate_task_prompt', { id }),
  /** The current global hotkey for a capture method (Tauri accelerator syntax). */
  getCaptureShortcut: (method: CaptureMethod) => invoke<string>('get_capture_shortcut', { method }),
  /** Bind a new hotkey for a capture method; rejects if invalid or already in use. */
  setCaptureShortcut: (method: CaptureMethod, shortcut: string) =>
    invoke<void>('set_capture_shortcut', { method, shortcut }),
  /** Which vault screen the post-login gate should show (unlocked / needs-setup /
   *  needs-unlock). Checks the server for an existing keyset when locked. */
  vaultStatus: () => invoke<VaultStatus>('vault_status'),
  /** First-time sync setup: create the vault + upload the keyset. Returns the Secret
   *  Key to show the user **once** — they must save it (it's never sent to the server). */
  setupVault: (masterPassword: string) => invoke<string>('setup_vault', { masterPassword }),
  /** Unlock the vault on this device from the server-stored keyset. */
  unlockVault: (masterPassword: string, secretKey: string) =>
    invoke<void>('unlock_vault', { masterPassword, secretKey }),
  /** Run one sync cycle (pull then push). Requires the vault unlocked. */
  syncNow: () => invoke<void>('sync_now'),
  /** Whether the vault is unlocked (the VMK is available) on this device. */
  isVaultUnlocked: () => invoke<boolean>('is_vault_unlocked'),
  /** Lock the vault (sign out of sync) — forgets the cached VMK. */
  lockVault: () => invoke<void>('lock_vault'),
};

// --- Browser fallback -------------------------------------------------------

// Seed the browser mock (no Tauri host) with a spread of tasks so the inbox,
// last-24h Completed card, and day-grouped Archive are all visible in `pnpm desktop`.
function seedMockTaskGroups(): TaskGroup[] {
  const now = new Date().toISOString();
  const group = (name: string): TaskGroup => ({
    id: crypto.randomUUID(),
    name,
    context: null,
    createdAt: now,
    updatedAt: now,
  });
  return [group('Work'), group('Sport')];
}

const mockTaskGroups: TaskGroup[] = seedMockTaskGroups();
let mockActiveTaskGroup: string | null = null;

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
    rawText: string = text,
  ): Task => ({
    id: crypto.randomUUID(),
    text,
    rawText,
    status: 'done',
    improved: false,
    link,
    taskGroupId: null,
    source: src,
    createdAt: hoursAgo(completedHoursAgo + 4),
    updatedAt: hoursAgo(completedHoursAgo),
    completedAt: hoursAgo(completedHoursAgo),
  });
  const active = (
    text: string,
    src: CaptureSource,
    link: string | null = null,
    taskGroupId: string | null = null,
    rawText: string = text,
  ): Task => ({
    id: crypto.randomUUID(),
    text,
    rawText,
    status: 'inbox',
    improved: false,
    link,
    taskGroupId,
    source: src,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    completedAt: null,
  });

  const slack = source('Slack', '#engineering');
  const chrome = source('Chrome', 'Linear — BLK-142');
  const notion = source('Notion', 'Roadmap Q3');
  const mail = source('Mail', 'Re: contract review');
  const work = mockTaskGroups[0]?.id ?? null;
  const sport = mockTaskGroups[1]?.id ?? null;

  return [
    // Inbox (active)
    active(
      'Draft the sync-server auth middleware',
      chrome,
      'https://linear.app/blink/issue/BLK-142',
      work,
      'need auth middleware on the sync server — verify the bearer token from the ' +
        'set-auth-token header, reject unauthenticated requests, and set app.current_user_id ' +
        'so RLS scopes the query. blocked on BLK-142',
    ),
    active('Reply to the security questionnaire', mail),
    active('Book the Tuesday climbing slot', notion, null, sport),
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

// Browser-only auth: accept any credentials so the login gate is developable
// without the Rust core / a running server.
let mockSession: AuthUser | null = null;
// Browser-only vault state — no real crypto/server; just enough for the setup/unlock
// UI to be developable. setup/unlock "unlock" it; lock clears it.
let mockVaultUnlocked = false;

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    // Sign-up always requires verification, so the OTP screen is exercisable in the browser.
    case 'sign_up':
      return { status: 'verificationRequired', user: null } as T;
    // Any code verifies/resets; sign-in then authenticates.
    case 'verify_email':
    case 'resend_verification':
    case 'request_password_reset':
    case 'reset_password':
      return undefined as T;
    case 'sign_in': {
      const email = String(args?.email ?? '');
      mockSession = { id: crypto.randomUUID(), email, name: email.split('@')[0] ?? email };
      return { status: 'authenticated', user: mockSession } as T;
    }
    case 'sign_out':
      mockSession = null;
      return undefined as T;
    case 'current_session':
      return mockSession as T;
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
        rawText: input.rawText.trim() ? input.rawText : input.text,
        status: 'inbox',
        improved: input.improved,
        link: input.link,
        taskGroupId: input.taskGroupId,
        source: input.source,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      mockStore.unshift(task);
      return task as T;
    }
    case 'delete_task': {
      const idx = mockStore.findIndex((t) => t.id === args?.id);
      if (idx >= 0) mockStore.splice(idx, 1);
      return undefined as T;
    }
    case 'reorder_task': {
      const first = mockStore.find((t) => t.id === args?.first);
      const second = mockStore.find((t) => t.id === args?.second);
      if (first && second) {
        const a = mockStore.indexOf(first);
        const b = mockStore.indexOf(second);
        mockStore[a] = second;
        mockStore[b] = first;
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
      const nextTaskGroupId = args?.taskGroupId;
      if (typeof nextTaskGroupId === 'string') {
        task.taskGroupId = nextTaskGroupId.trim() ? nextTaskGroupId.trim() : null;
      }
      task.updatedAt = new Date().toISOString();
      return task as T;
    }
    case 'list_task_groups':
      return [...mockTaskGroups] as T;
    case 'create_task_group': {
      const input = args?.group as NewTaskGroup;
      const name = input.name.trim();
      if (!name) throw new Error('group name cannot be empty');
      if (mockTaskGroups.some((g) => g.name === name)) {
        throw new Error('a group with this name already exists');
      }
      const context = input.context?.trim();
      const now = new Date().toISOString();
      const group: TaskGroup = {
        id: crypto.randomUUID(),
        name,
        context: context ? context : null,
        createdAt: now,
        updatedAt: now,
      };
      mockTaskGroups.push(group);
      return group as T;
    }
    case 'update_task_group': {
      const group = mockTaskGroups.find((g) => g.id === args?.id);
      if (!group) throw new Error('task group not found');
      if (typeof args?.name === 'string') {
        const name = args.name.trim();
        if (!name) throw new Error('group name cannot be empty');
        if (mockTaskGroups.some((g) => g.name === name && g.id !== group.id)) {
          throw new Error('a group with this name already exists');
        }
        group.name = name;
      }
      if (typeof args?.context === 'string') {
        const context = args.context.trim();
        group.context = context ? context : null;
      }
      group.updatedAt = new Date().toISOString();
      return group as T;
    }
    case 'delete_task_group': {
      const idx = mockTaskGroups.findIndex((g) => g.id === args?.id);
      if (idx >= 0) mockTaskGroups.splice(idx, 1);
      for (const task of mockStore) {
        if (task.taskGroupId === args?.id) task.taskGroupId = null;
      }
      if (mockActiveTaskGroup === args?.id) mockActiveTaskGroup = null;
      return undefined as T;
    }
    case 'get_active_task_group':
      return mockActiveTaskGroup as T;
    case 'set_active_task_group': {
      mockActiveTaskGroup = typeof args?.taskGroupId === 'string' ? args.taskGroupId : null;
      return undefined as T;
    }
    case 'dismiss_copy_capture':
    case 'dismiss_manual_capture':
      return undefined as T;
    case 'improve_text':
      // Browser mock can't reach OpenAI — echo the input back.
      return String(args?.text ?? '') as T;
    case 'generate_task_prompt': {
      // No OpenAI in the browser — build a deterministic prompt from the task's fields,
      // same honesty level as the improve_text echo above.
      const task = mockStore.find((t) => t.id === args?.id);
      if (!task) throw new Error('task not found');
      const parts = [
        `Help me complete this task: ${task.text}`,
        `\nOriginal captured text:\n${task.rawText}`,
      ];
      const source = task.source.appName || task.source.appId;
      if (source) parts.push(`\nCaptured from: ${source}`);
      if (task.link) parts.push(`Link: ${task.link}`);
      const groupContext = task.taskGroupId
        ? mockTaskGroups.find((g) => g.id === task.taskGroupId)?.context
        : null;
      if (groupContext) parts.push(`\nGroup context:\n${groupContext}`);
      const prompt = parts.join('\n');
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        // No clipboard permission in the browser — the returned prompt still drives the UI.
      }
      return prompt as T;
    }
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
    case 'vault_status':
      // Browser mock: unlocked once set up/unlocked, else treat as a fresh account.
      return (mockVaultUnlocked ? 'unlocked' : 'needsSetup') as T;
    case 'setup_vault':
      // No real crypto in the browser — return a plausible-looking Secret Key.
      mockVaultUnlocked = true;
      return 'A3-1a2b3c4d-5e6f7a8b-9c0d1e2f-3a4b5c6d' as T;
    case 'unlock_vault':
      mockVaultUnlocked = true;
      return undefined as T;
    case 'sync_now':
      return undefined as T;
    case 'is_vault_unlocked':
      return mockVaultUnlocked as T;
    case 'lock_vault':
      mockVaultUnlocked = false;
      return undefined as T;
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
