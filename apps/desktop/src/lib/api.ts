import type { AuthResult } from '@/generated/AuthResult';
import type { AuthUser } from '@/generated/AuthUser';
import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { CaptureSource } from '@/generated/CaptureSource';
import type { EditorOption } from '@/generated/EditorOption';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import type { NewTask } from '@/generated/NewTask';
import type { NewTaskGroup } from '@/generated/NewTaskGroup';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Task } from '@/generated/Task';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { VaultStatus } from '@/generated/VaultStatus';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import type { WorktreeAttentionUpdate } from '@/generated/WorktreeAttentionUpdate';

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
  /** A masked preview of the stored key (`sk-…YxkA`), or `null` when none is set. The
   *  AI features gate on this being present; the full key never enters the webview. */
  aiStatus: () => invoke<string | null>('ai_status'),
  /** Test an API key against the provider and, only if it works, store it in the
   *  keychain. Rejects (without saving) when the connection test fails. */
  setAiApiKey: (key: string) => invoke<void>('set_ai_api_key', { key }),
  /** Forget the stored API key — disables the AI features. */
  clearAiApiKey: () => invoke<void>('clear_ai_api_key'),
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
  // --- Managed repos (repo stuff) ---------------------------------------------
  /** The git repos the worktree manager tracks (curated in Settings). */
  listManagedRepos: () => invoke<ManagedRepo[]>('list_managed_repos'),
  /** Drop a repo from the managed list; returns the new list. */
  removeManagedRepo: (path: string) => invoke<ManagedRepo[]>('remove_managed_repo', { path }),
  /** Open a native folder picker; on selection, add the chosen git repo and return the
   *  updated list (unchanged if the user cancels). */
  pickManagedRepo: () => invoke<ManagedRepo[]>('pick_managed_repo'),
  // --- Worktrees (worktree stuff) ---------------------------------------------
  /** The linked worktrees of a managed repo (with dirty + tmux-session state). */
  listWorktrees: (repoPath: string) => invoke<Worktree[]>('list_worktrees', { repoPath }),
  /** Create (or attach) a worktree for `branch` and ensure its tmux/Claude session. */
  addWorktree: (repoPath: string, branch: string) =>
    invoke<Worktree>('add_worktree', { repoPath, branch }),
  /** Remove a worktree + its session + its local branch. `force` removes a dirty/untracked
   *  worktree. The remote branch is untouched (see `deleteRemoteBranch`). */
  removeWorktree: (repoPath: string, branch: string, force: boolean) =>
    invoke<void>('remove_worktree', { repoPath, branch, force }),
  /** Delete the branch on the remote (GitHub). No-op if it was never pushed. */
  deleteRemoteBranch: (repoPath: string, branch: string) =>
    invoke<void>('delete_remote_branch', { repoPath, branch }),
  /** Preview (`apply=false`) or perform (`apply=true`) a prune of merged/gone worktrees. */
  pruneWorktrees: (repoPath: string, apply: boolean) =>
    invoke<PruneCandidate[]>('prune_worktrees', { repoPath, apply }),
  /** Open a terminal attached to the worktree's tmux/Claude session (creating it if needed). */
  openWorktreeInTerminal: (repoPath: string, branch: string) =>
    invoke<void>('open_worktree_in_terminal', { repoPath, branch }),
  /** Open the worktree's folder in the configured editor. */
  openWorktreeInEditor: (repoPath: string, branch: string) =>
    invoke<void>('open_worktree_in_editor', { repoPath, branch }),
  /** The attention snapshot across every managed repo's live sessions. Initial state for the
   *  dashboard; the `worktree-attention` event keeps it live thereafter. */
  getWorktreeAttention: () => invoke<WorktreeAttentionUpdate[]>('get_worktree_attention'),
  // Worktree settings — where worktrees are created + how they open.
  /** The configured global worktree base directory, or null for the derived default. */
  getWorktreeBaseDir: () => invoke<string | null>('get_worktree_base_dir'),
  /** Set (or clear with null/empty) the global worktree base directory. */
  setWorktreeBaseDir: (path: string | null) => invoke<void>('set_worktree_base_dir', { path }),
  /** Open a native folder picker; on selection, save it as the base dir and return the
   *  chosen path. Returns null if the user cancels. */
  pickWorktreeBaseDir: () => invoke<string | null>('pick_worktree_base_dir'),
  /** The terminal launch command ({session} = the tmux session name). */
  getWorktreeTerminal: () => invoke<string>('get_worktree_terminal'),
  /** Set (or clear to the default with null/empty) the terminal launch command. */
  setWorktreeTerminal: (command: string | null) =>
    invoke<void>('set_worktree_terminal', { command }),
  /** The editor launch command ({path} = the worktree path). */
  getWorktreeEditor: () => invoke<string>('get_worktree_editor'),
  /** Installed editors Blink can offer as one-click choices in Settings. */
  listWorktreeEditors: () => invoke<EditorOption[]>('list_worktree_editors'),
  /** Set (or clear to the default with null/empty) the editor launch command. */
  setWorktreeEditor: (command: string | null) =>
    invoke<void>('set_worktree_editor', { command }),
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
// Browser-only AI key — no real provider call; any non-empty key "connects".
let mockAiKey: string | null = null;
// Browser-only worktree state — no real git/tmux; enough to develop the Worktrees page.
let mockWorktreeBaseDir: string | null = null;
let mockWorktreeTerminal: string | null = null;
let mockWorktreeEditor: string | null = null;
const DEFAULT_TERMINAL_COMMAND = 'alacritty -e tmux attach -t {session}';
const DEFAULT_EDITOR_COMMAND = 'code {path}';
let mockManagedRepos: ManagedRepo[] = [
  { name: 'blink', path: '/Users/you/repositories/blink', baseBranch: null },
];
const mockWorktrees: Record<string, Worktree[]> = {
  '/Users/you/repositories/blink': [
    {
      repo: '/Users/you/repositories/blink',
      branch: 'feat/sync-retry',
      path: '/Users/you/repositories/worktrees/blink/feat/sync-retry',
      isMain: false,
      isDirty: true,
      sessionLive: true,
    },
    {
      repo: '/Users/you/repositories/blink',
      branch: 'fix/dlp-rules',
      path: '/Users/you/repositories/worktrees/blink/fix/dlp-rules',
      isMain: false,
      isDirty: false,
      sessionLive: false,
    },
  ],
};

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
    case 'ai_status':
      return (mockAiKey ? maskKey(mockAiKey) : null) as T;
    case 'set_ai_api_key': {
      const key = String(args?.key ?? '').trim();
      if (!key) throw new Error('API key is empty');
      // No real provider in the browser — accept any non-empty key as "connected".
      mockAiKey = key;
      return undefined as T;
    }
    case 'clear_ai_api_key':
      mockAiKey = null;
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
    case 'get_worktree_base_dir':
      return mockWorktreeBaseDir as T;
    case 'set_worktree_base_dir': {
      const path = typeof args?.path === 'string' ? args.path.trim() : '';
      mockWorktreeBaseDir = path ? path : null;
      return undefined as T;
    }
    case 'pick_worktree_base_dir': {
      // No native dialog in the browser — prompt for a path so the flow is developable.
      const picked = window.prompt('Mock folder picker — enter a base directory (empty cancels)');
      const value = picked?.trim() ?? '';
      if (!value) return null as T;
      mockWorktreeBaseDir = value;
      return value as T;
    }
    case 'get_worktree_terminal':
      return (mockWorktreeTerminal ?? DEFAULT_TERMINAL_COMMAND) as T;
    case 'set_worktree_terminal': {
      const command = typeof args?.command === 'string' ? args.command.trim() : '';
      mockWorktreeTerminal = command ? command : null;
      return undefined as T;
    }
    case 'list_worktree_editors':
      // Browser mock — a representative couple so the picker is developable.
      return [
        { name: 'VS Code', command: 'code {path}' },
        { name: 'Cursor', command: 'cursor {path}' },
      ] as T;
    case 'get_worktree_editor':
      return (mockWorktreeEditor ?? DEFAULT_EDITOR_COMMAND) as T;
    case 'set_worktree_editor': {
      const command = typeof args?.command === 'string' ? args.command.trim() : '';
      mockWorktreeEditor = command ? command : null;
      return undefined as T;
    }
    case 'open_worktree_in_editor':
      // No real editor in the browser — nothing to launch.
      return undefined as T;
    case 'list_managed_repos':
      return [...mockManagedRepos] as T;
    case 'remove_managed_repo': {
      const path = String(args?.path ?? '');
      mockManagedRepos = mockManagedRepos.filter((r) => r.path !== path);
      return [...mockManagedRepos] as T;
    }
    case 'pick_managed_repo': {
      // No native dialog in the browser — prompt for a path so the flow is developable.
      const picked = window.prompt('Mock folder picker — enter a repo path (empty cancels)');
      const path = picked?.trim() ?? '';
      if (path && !mockManagedRepos.some((r) => r.path === path)) {
        const name = path.split('/').filter(Boolean).pop() ?? path;
        mockManagedRepos.push({ name, path, baseBranch: null });
        mockWorktrees[path] ??= [];
      }
      return [...mockManagedRepos] as T;
    }
    case 'list_worktrees':
      return [...(mockWorktrees[String(args?.repoPath ?? '')] ?? [])] as T;
    case 'add_worktree': {
      const repoPath = String(args?.repoPath ?? '');
      const branch = String(args?.branch ?? '').trim();
      if (!branch) throw new Error('branch is empty');
      const list = (mockWorktrees[repoPath] ??= []);
      let worktree = list.find((w) => w.branch === branch);
      if (!worktree) {
        worktree = {
          repo: repoPath,
          branch,
          path: `/Users/you/repositories/worktrees/${repoPath.split('/').pop()}/${branch}`,
          isMain: false,
          isDirty: false,
          sessionLive: true,
        };
        list.push(worktree);
      } else {
        worktree.sessionLive = true;
      }
      return worktree as T;
    }
    case 'remove_worktree': {
      const repoPath = String(args?.repoPath ?? '');
      const branch = String(args?.branch ?? '');
      const list = mockWorktrees[repoPath];
      if (list) {
        const idx = list.findIndex((w) => w.branch === branch);
        if (idx >= 0) list.splice(idx, 1);
      }
      return undefined as T;
    }
    case 'delete_remote_branch':
      // No real git in the browser — nothing to delete.
      return undefined as T;
    case 'prune_worktrees': {
      // Mock: treat clean, non-live worktrees as "gone" candidates.
      const repoPath = String(args?.repoPath ?? '');
      const apply = args?.apply === true;
      const list = mockWorktrees[repoPath] ?? [];
      const candidates: PruneCandidate[] = list
        .filter((w) => !w.isMain && !w.isDirty && !w.sessionLive)
        .map((w) => ({ branch: w.branch, reason: 'upstream gone' }));
      if (apply) {
        mockWorktrees[repoPath] = list.filter(
          (w) => !candidates.some((c) => c.branch === w.branch),
        );
      }
      return candidates as T;
    }
    case 'open_worktree_in_terminal': {
      const list = mockWorktrees[String(args?.repoPath ?? '')];
      const worktree = list?.find((w) => w.branch === String(args?.branch ?? ''));
      if (worktree) worktree.sessionLive = true;
      return undefined as T;
    }
    case 'get_worktree_attention': {
      // No real tmux in the browser — synthesize a spread of states across the live
      // sessions so the dots + "needs you" badge are developable.
      const states: WorktreeAttention[] = ['needsInput', 'working', 'done', 'errored'];
      const out: WorktreeAttentionUpdate[] = [];
      for (const [repoPath, list] of Object.entries(mockWorktrees)) {
        list.forEach((w, i) => {
          if (!w.sessionLive) return;
          out.push({
            repo: repoPath,
            branch: w.branch,
            attention: states[i % states.length] as WorktreeAttention,
          });
        });
      }
      return out as T;
    }
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

// Mirror the native `mask_key`: first three + last four, else a bare prefix.
function maskKey(key: string): string {
  const k = key.trim();
  return k.length <= 8 ? 'sk-…' : `${k.slice(0, 3)}…${k.slice(-4)}`;
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
