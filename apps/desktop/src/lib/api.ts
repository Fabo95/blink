import type { AuthResult } from '@/generated/AuthResult';
import type { AuthUser } from '@/generated/AuthUser';
import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { CaptureSource } from '@/generated/CaptureSource';
import type { EditorOption } from '@/generated/EditorOption';
import type { EgressEvent } from '@/generated/EgressEvent';
import type { Evidence } from '@/generated/Evidence';
import type { ExportFormat } from '@/generated/ExportFormat';
import type { ManagedRepo } from '@/generated/ManagedRepo';
import type { NewNote } from '@/generated/NewNote';
import type { NewTask } from '@/generated/NewTask';
import type { NewTaskGroup } from '@/generated/NewTaskGroup';
import type { NewTopic } from '@/generated/NewTopic';
import type { Note } from '@/generated/Note';
import type { NoteLink } from '@/generated/NoteLink';
import type { NoteRelation } from '@/generated/NoteRelation';
import type { NoteReview } from '@/generated/NoteReview';
import type { NoteRevision } from '@/generated/NoteRevision';
import type { NoteStatus } from '@/generated/NoteStatus';
import type { NoteType } from '@/generated/NoteType';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { ReviewDecision } from '@/generated/ReviewDecision';
import type { ReviewNudge } from '@/generated/ReviewNudge';
import type { ReviewOutcome } from '@/generated/ReviewOutcome';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { Task } from '@/generated/Task';
import type { TaskEffort } from '@/generated/TaskEffort';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { TerminalOption } from '@/generated/TerminalOption';
import type { Topic } from '@/generated/Topic';
import type { TopicStatus } from '@/generated/TopicStatus';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import type { WorktreeAttentionUpdate } from '@/generated/WorktreeAttentionUpdate';
import type { WorktreeStatus } from '@/generated/WorktreeStatus';

/**
 * Typed façade over the Tauri IPC boundary. Each method maps to a `#[tauri::command]`
 * in `src-tauri/src/commands/`. When the frontend runs under plain Vite (no
 * Tauri host, e.g. `pnpm --filter @blink/desktop dev` in a browser), we fall back
 * to an in-memory mock so the UI is still developable without the Rust core.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** A way to capture a task or note; each has its own global hotkey and window. */
export type CaptureMethod = 'copy' | 'manual' | 'idea';

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
      effort?: TaskEffort;
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
      effort: patch.effort,
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
  /** Close the idea-capture panel and return focus to the previous app. */
  dismissIdeaCapture: () => invoke<void>('dismiss_idea_capture'),
  // --- Ideas: topics + notes --------------------------------------------------
  listTopics: () => invoke<Topic[]>('list_topics'),
  createTopic: (topic: NewTopic) => invoke<Topic>('create_topic', { topic }),
  /** Patch a topic. Send only what changed; an empty-string `question` clears it. */
  updateTopic: (
    id: string,
    patch: {
      name?: string;
      question?: string;
      status?: TopicStatus;
      sensitivity?: Sensitivity;
    },
  ) =>
    invoke<Topic>('update_topic', {
      id,
      name: patch.name,
      question: patch.question,
      status: patch.status,
      sensitivity: patch.sensitivity,
    }),
  /** Delete a topic; `deleteNotes` deletes its notes too, otherwise they become unfiled. */
  deleteTopic: (id: string, deleteNotes: boolean) =>
    invoke<void>('delete_topic', { id, deleteNotes }),
  /** The Ideas page's active topic filter, shared with the capture windows. */
  getActiveTopic: () => invoke<string | null>('get_active_topic'),
  setActiveTopic: (topicId: string | null) => invoke<void>('set_active_topic', { topicId }),
  listNotes: () => invoke<Note[]>('list_notes'),
  /** Full-text search over every note, best match first. */
  searchNotes: (query: string) => invoke<Note[]>('search_notes', { query }),
  saveNote: (note: NewNote) => invoke<Note>('save_note', { note }),
  /** Patch a note. Send only what changed; an empty `link`/`topicId` clears it. A text
   *  change keeps the previous text as a revision. */
  updateNote: (
    id: string,
    patch: {
      text?: string;
      noteType?: NoteType;
      link?: string;
      topicId?: string;
      improved?: boolean;
      source?: string;
    },
  ) =>
    invoke<Note>('update_note', {
      id,
      text: patch.text,
      noteType: patch.noteType,
      link: patch.link,
      topicId: patch.topicId,
      improved: patch.improved,
      source: patch.source,
    }),
  deleteNote: (id: string) => invoke<void>('delete_note', { id }),
  /** A note's revisions, newest first. Also clears the note's conflict marker. */
  noteHistory: (id: string) => invoke<NoteRevision[]>('note_history', { id }),
  restoreNoteRevision: (noteId: string, revisionId: string) =>
    invoke<Note>('restore_note_revision', { noteId, revisionId }),
  /** Fetch and summarize a source again (after a failure, or to refresh it). */
  retryEnrichment: (id: string) => invoke<Note>('retry_enrichment', { id }),
  /** Every link touching a note, in either direction. */
  listNoteLinks: (noteId: string) => invoke<NoteLink[]>('list_note_links', { noteId }),
  /** Link two notes: `fromNoteId` supports, contradicts, or relates to `toNoteId`. */
  linkNotes: (fromNoteId: string, toNoteId: string, relation: NoteRelation) =>
    invoke<NoteLink>('link_notes', { fromNoteId, toNoteId, relation }),
  unlinkNotes: (id: string) => invoke<void>('unlink_notes', { id }),
  /** What left this Mac recently (AI calls, page fetches), newest first. Never content. */
  listEgressEvents: () => invoke<EgressEvent[]>('list_egress_events'),
  /** Ideas and thoughts due for review now, most overdue first. */
  listDueNotes: () => invoke<Note[]>('list_due_notes'),
  /** Every review a note was given, oldest first. */
  listNoteReviews: (noteId: string) => invoke<NoteReview[]>('list_note_reviews', { noteId }),
  /** Record a review (conviction 1 to 5) and apply its decision: keep and reschedule, drop,
   *  or promote into an inbox task. */
  reviewNote: (
    noteId: string,
    conviction: number,
    comment: string | null,
    decision: ReviewDecision,
  ) => invoke<ReviewOutcome>('review_note', { noteId, conviction, comment, decision }),
  /** Export one topic (or everything exportable with `null`) to a file picked in the save
   *  dialog. Resolves to the written path, or `null` if the user cancelled. */
  exportNotes: (topicId: string | null, format: ExportFormat) =>
    invoke<string | null>('export_notes', { topicId, format }),
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
  /** Improve a note's text with AI. Rejects when the note's topic is confidential. */
  improveNoteText: (text: string, topicId: string | null) =>
    invoke<string>('improve_note_text', { text, topicId }),
  /** Generate a ready-to-paste assistant prompt from a task's raw text and copy it to
   *  the clipboard (returns the prompt). */
  generateTaskPrompt: (id: string) => invoke<string>('generate_task_prompt', { id }),
  /** The current global hotkey for a capture method (Tauri accelerator syntax). */
  getCaptureShortcut: (method: CaptureMethod) => invoke<string>('get_capture_shortcut', { method }),
  /** Bind a new hotkey for a capture method; rejects if invalid or already in use. */
  setCaptureShortcut: (method: CaptureMethod, shortcut: string) =>
    invoke<void>('set_capture_shortcut', { method, shortcut }),
  /** Run one sync cycle (pull then push). A no-op until signed in. */
  syncNow: () => invoke<void>('sync_now'),
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
  /** GitHub PR status per branch (only branches with a PR), fetched after `listWorktrees` so
   *  the list isn't blocked on the network. Overlaid onto each worktree's local status. */
  listWorktreePrStatuses: (repoPath: string) =>
    invoke<Record<string, WorktreeStatus>>('list_worktree_pr_statuses', { repoPath }),
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
  /** Installed terminals Blink can offer as one-click choices in Settings. */
  listTerminals: () => invoke<TerminalOption[]>('list_terminals'),
  /** The editor launch command ({path} = the worktree path). */
  getWorktreeEditor: () => invoke<string>('get_worktree_editor'),
  /** Installed editors Blink can offer as one-click choices in Settings. */
  listEditors: () => invoke<EditorOption[]>('list_editors'),
  /** Set (or clear to the default with null/empty) the editor launch command. */
  setWorktreeEditor: (command: string | null) => invoke<void>('set_worktree_editor', { command }),
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
    effort: 'standard',
    improved: false,
    link,
    taskGroupId: null,
    source: src,
    createdAt: hoursAgo(completedHoursAgo + 4),
    updatedAt: hoursAgo(completedHoursAgo),
    completedAt: hoursAgo(completedHoursAgo),
    originNoteId: null,
  });
  const active = (
    text: string,
    src: CaptureSource,
    link: string | null = null,
    taskGroupId: string | null = null,
    rawText: string = text,
    effort: TaskEffort = 'standard',
  ): Task => ({
    id: crypto.randomUUID(),
    text,
    rawText,
    status: 'inbox',
    effort,
    improved: false,
    link,
    taskGroupId,
    source: src,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    completedAt: null,
    originNoteId: null,
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
    active('Book the Tuesday climbing slot', notion, null, sport, undefined, 'quick'),
    active('Approve the Figma invite', slack, null, work, undefined, 'quick'),
    active('Confirm the offsite date with Lena', mail, null, work, undefined, 'quick'),
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
  idea: 'CommandOrControl+Shift+I',
};

// Seed topics across all three sensitivities and notes across all types, plus one note
// with a sync conflict and history, so every Ideas state is visible in `pnpm desktop`.
function seedMockTopics(): Topic[] {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const topic = (
    name: string,
    question: string | null,
    sensitivity: Sensitivity,
    status: TopicStatus,
    age: number,
  ): Topic => ({
    id: crypto.randomUUID(),
    name,
    question,
    status,
    sensitivity,
    createdAt: daysAgo(age),
    updatedAt: daysAgo(age),
  });
  return [
    topic(
      'Agentic commerce',
      'Is there a business in agents booking local businesses?',
      'personal',
      'exploring',
      30,
    ),
    topic(
      'Review bottleneck',
      'What makes agent-written code safe to merge?',
      'internal',
      'parked',
      20,
    ),
    topic('Board strategy', null, 'confidential', 'pursuing', 10),
  ];
}

const mockTopics: Topic[] = seedMockTopics();
let mockActiveTopic: string | null = null;
const mockNoteRevisions: NoteRevision[] = [];
const mockNoteReviews: NoteReview[] = [];
const DAY_MS = 86_400_000;

// Mirrors the core's review rules (`review_service.rs`): first review after 14 days for
// ideas and thoughts, then sooner the more convinced you are.
function mockFirstRevisit(noteType: NoteType, from: number): string | null {
  return noteType === 'source' ? null : new Date(from + 14 * DAY_MS).toISOString();
}

function mockNextRevisit(conviction: number, from: number): string | null {
  const days = ({ 5: 7, 4: 14, 3: 30, 2: 60 } as Record<number, number>)[conviction];
  return days === undefined ? null : new Date(from + days * DAY_MS).toISOString();
}

function mockNudge(history: number[], status: NoteStatus): ReviewNudge | null {
  const last = history[history.length - 1];
  if (last === undefined) return null;
  const tail = (n: number) => (history.length >= n ? history.slice(-n) : null);
  if (status !== 'promoted' && tail(3)?.every((c) => c >= 4)) return 'promote';
  if (last <= 1 || tail(2)?.every((c) => c <= 2)) return 'drop';
  return null;
}

const mockNoteLinks: NoteLink[] = [];
const mockEgress: EgressEvent[] = [];

function mockEvidence(noteId: string): Evidence {
  const evidence: Evidence = { supports: 0, contradicts: 0, related: 0 };
  for (const link of mockNoteLinks) {
    if (link.toNoteId === noteId && link.relation === 'supports') evidence.supports += 1;
    if (link.toNoteId === noteId && link.relation === 'contradicts') evidence.contradicts += 1;
    if (link.relation === 'related' && (link.toNoteId === noteId || link.fromNoteId === noteId)) {
      evidence.related += 1;
    }
  }
  return evidence;
}

function mockEgressEvent(kind: EgressEvent['kind'], destination: string, bytes: number) {
  mockEgress.unshift({
    id: crypto.randomUUID(),
    kind,
    destination,
    noteId: null,
    bytes,
    createdAt: new Date().toISOString(),
  });
}

// Mirrors the core's `decorate`: conviction history, nudge, and evidence are derived.
function mockWithReviews(note: Note): Note {
  const history = mockNoteReviews.filter((r) => r.noteId === note.id).map((r) => r.conviction);
  return {
    ...note,
    convictionHistory: history,
    reviewNudge: mockNudge(history, note.status),
    evidence: mockEvidence(note.id),
  };
}

function seedMockNotes(): Note[] {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const [commerce, review, board] = mockTopics.map((t) => t.id);
  const note = (
    noteType: NoteType,
    text: string,
    topicId: string | null,
    age: number,
    link: string | null = null,
    appName = 'Manual',
  ): Note => ({
    id: crypto.randomUUID(),
    noteType,
    text,
    rawText: text,
    link,
    topicId,
    improved: false,
    conflict: false,
    status: 'open',
    revisitAt: mockFirstRevisit(noteType, Date.now() - age * DAY_MS),
    convictionHistory: [],
    reviewNudge: null,
    title: null,
    excerpt: null,
    summary: null,
    enrichment: noteType === 'source' && link ? 'done' : 'none',
    evidence: { supports: 0, contradicts: 0, related: 0 },
    source: { appId: appName.toLowerCase(), appName, windowTitle: '', capturedAt: daysAgo(age) },
    createdAt: daysAgo(age),
    updatedAt: daysAgo(age),
  });
  const conflicted = note(
    'idea',
    'Restaurant MCP server that exposes live availability',
    commerce ?? null,
    12,
  );
  conflicted.conflict = true;
  mockNoteRevisions.push(
    {
      id: crypto.randomUUID(),
      noteId: conflicted.id,
      text: 'Restaurant MCP server, availability + deals',
      reason: 'conflict',
      createdAt: daysAgo(1),
    },
    {
      id: crypto.randomUUID(),
      noteId: conflicted.id,
      text: 'MCP server for restaurants',
      reason: 'edit',
      createdAt: daysAgo(6),
    },
  );
  // Two notes due: one with a mixed history, one rated 4+ three times (promote nudge). One
  // dropped note, which only shows up in search.
  const feed = note(
    'idea',
    'Agent-readable availability feed for restaurants',
    commerce ?? null,
    35,
  );
  const bottleneck = note(
    'thought',
    'Review is the new bottleneck, not writing code',
    review ?? null,
    40,
  );
  const dropped = note('idea', 'A restaurant chatbot for reservations', commerce ?? null, 50);
  dropped.status = 'dropped';
  dropped.revisitAt = null;
  const reviewed = (noteId: string, convictions: number[], firstDaysAgo: number) => {
    for (const [i, conviction] of convictions.entries()) {
      mockNoteReviews.push({
        id: crypto.randomUUID(),
        noteId,
        conviction,
        comment: null,
        reviewedAt: daysAgo(firstDaysAgo - i * 7),
      });
    }
  };
  reviewed(feed.id, [3, 4], 20);
  reviewed(bottleneck.id, [4, 4, 5], 25);
  reviewed(dropped.id, [2, 1], 30);

  // Sources in every enrichment state, and links so the evidence chips show.
  const stripe = note(
    'source',
    'Stripe agentic payments: delegated payment tokens for AI agents',
    commerce ?? null,
    4,
    'https://stripe.com/blog/agentic-commerce',
    'Chrome',
  );
  stripe.title = 'Introducing agentic commerce';
  stripe.excerpt = 'Agents can now pay on behalf of users with scoped, revocable tokens…';
  stripe.summary =
    'Stripe describes delegated payment tokens that let AI agents pay on a user’s behalf. ' +
    'Tokens are scoped to a merchant and amount and can be revoked at any time. ' +
    'The post positions this as the payment layer for agent-led shopping.';
  const failed = note(
    'source',
    'Survey: diners would let an assistant book for them',
    commerce ?? null,
    3,
    'https://example.org/survey-2026',
    'Safari',
  );
  failed.enrichment = 'failed';
  const confidentialSource = note(
    'source',
    'Board deck, Q3 numbers',
    board ?? null,
    1,
    'https://docs.internal/board-q3',
  );
  confidentialSource.enrichment = 'skipped';
  const liability = note(
    'thought',
    'Who is liable when an agent books the wrong table?',
    commerce ?? null,
    7,
  );
  const link = (from: Note, to: Note, relation: NoteRelation) =>
    mockNoteLinks.push({
      id: crypto.randomUUID(),
      fromNoteId: from.id,
      toNoteId: to.id,
      relation,
      createdAt: daysAgo(2),
    });
  link(stripe, feed, 'supports');
  link(failed, feed, 'supports');
  link(liability, feed, 'contradicts');
  mockEgressEvent('pageFetch', 'stripe.com', 0);
  mockEgressEvent('aiSummary', 'api.openai.com', 2140);
  mockEgressEvent('aiImprove', 'api.openai.com', 182);
  return [
    feed,
    conflicted,
    dropped,
    liability,
    stripe,
    failed,
    confidentialSource,
    bottleneck,
    note('idea', 'Spin the vertical into its own company', board ?? null, 9),
    note('thought', 'Keep a pain log for two weeks', null, 2),
  ];
}

const mockNotes: Note[] = seedMockNotes();

// Browser-only auth: accept any credentials so the login gate is developable
// without the Rust core / a running server.
let mockSession: AuthUser | null = null;
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
      status: 'pushed',
    },
    {
      repo: '/Users/you/repositories/blink',
      branch: 'fix/dlp-rules',
      path: '/Users/you/repositories/worktrees/blink/fix/dlp-rules',
      isMain: false,
      isDirty: false,
      sessionLive: false,
      status: 'gone',
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
        effort: 'standard',
        improved: input.improved,
        link: input.link,
        taskGroupId: input.taskGroupId,
        source: input.source,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        originNoteId: input.originNoteId ?? null,
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
      const nextEffort = args?.effort;
      if (nextEffort === 'quick' || nextEffort === 'standard' || nextEffort === 'deep') {
        task.effort = nextEffort;
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
    case 'dismiss_idea_capture':
      return undefined as T;
    case 'list_topics':
      return [...mockTopics] as T;
    case 'create_topic': {
      const input = args?.topic as NewTopic;
      const name = input.name.trim();
      if (!name) throw new Error('topic name cannot be empty');
      if (mockTopics.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('a topic with this name already exists');
      }
      const now = new Date().toISOString();
      const topic: Topic = {
        id: crypto.randomUUID(),
        name,
        question: input.question?.trim() || null,
        status: 'exploring',
        sensitivity: input.sensitivity,
        createdAt: now,
        updatedAt: now,
      };
      mockTopics.push(topic);
      return topic as T;
    }
    case 'update_topic': {
      const topic = mockTopics.find((t) => t.id === args?.id);
      if (!topic) throw new Error('topic not found');
      if (typeof args?.name === 'string') {
        const name = args.name.trim();
        if (!name) throw new Error('topic name cannot be empty');
        if (
          mockTopics.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== topic.id)
        ) {
          throw new Error('a topic with this name already exists');
        }
        topic.name = name;
      }
      if (typeof args?.question === 'string') topic.question = args.question.trim() || null;
      const status = args?.status;
      if (
        status === 'exploring' ||
        status === 'pursuing' ||
        status === 'parked' ||
        status === 'dropped'
      ) {
        topic.status = status;
      }
      const sensitivity = args?.sensitivity;
      if (
        sensitivity === 'personal' ||
        sensitivity === 'internal' ||
        sensitivity === 'confidential'
      ) {
        topic.sensitivity = sensitivity;
      }
      topic.updatedAt = new Date().toISOString();
      return topic as T;
    }
    case 'delete_topic': {
      const idx = mockTopics.findIndex((t) => t.id === args?.id);
      if (idx >= 0) mockTopics.splice(idx, 1);
      for (let i = mockNotes.length - 1; i >= 0; i -= 1) {
        const note = mockNotes[i];
        if (!note || note.topicId !== args?.id) continue;
        if (args?.deleteNotes === true) mockNotes.splice(i, 1);
        else note.topicId = null;
      }
      if (mockActiveTopic === args?.id) mockActiveTopic = null;
      return undefined as T;
    }
    case 'get_active_topic':
      return mockActiveTopic as T;
    case 'set_active_topic':
      mockActiveTopic = typeof args?.topicId === 'string' ? args.topicId : null;
      return undefined as T;
    case 'list_notes':
      return mockNotes.map(mockWithReviews) as T;
    case 'list_due_notes': {
      const now = Date.now();
      return mockNotes
        .filter(
          (n) =>
            n.status !== 'dropped' &&
            n.noteType !== 'source' &&
            n.revisitAt !== null &&
            Date.parse(n.revisitAt) <= now,
        )
        .sort((a, b) => Date.parse(a.revisitAt ?? '') - Date.parse(b.revisitAt ?? ''))
        .map(mockWithReviews) as T;
    }
    case 'retry_enrichment': {
      const note = mockNotes.find((n) => n.id === args?.id);
      if (!note) throw new Error('note not found');
      if (note.noteType !== 'source' || !note.link) {
        throw new Error('only a source with a link can be fetched');
      }
      // No network in the browser: pretend the fetch worked after a moment.
      note.enrichment = 'pending';
      setTimeout(() => {
        note.enrichment = 'done';
        note.title = note.title ?? 'Fetched page title';
      }, 1500);
      return mockWithReviews(note) as T;
    }
    case 'list_note_links':
      return mockNoteLinks.filter(
        (l) => l.fromNoteId === args?.noteId || l.toNoteId === args?.noteId,
      ) as T;
    case 'link_notes': {
      const from = String(args?.fromNoteId ?? '');
      const to = String(args?.toNoteId ?? '');
      if (from === to) throw new Error("a note can't be linked to itself");
      const exists = mockNoteLinks.some(
        (l) =>
          (l.fromNoteId === from && l.toNoteId === to) ||
          (l.fromNoteId === to && l.toNoteId === from),
      );
      if (exists) throw new Error('these notes are already linked');
      const relation = args?.relation;
      const created: NoteLink = {
        id: crypto.randomUUID(),
        fromNoteId: from,
        toNoteId: to,
        relation: relation === 'supports' || relation === 'contradicts' ? relation : 'related',
        createdAt: new Date().toISOString(),
      };
      mockNoteLinks.push(created);
      return created as T;
    }
    case 'unlink_notes': {
      const idx = mockNoteLinks.findIndex((l) => l.id === args?.id);
      if (idx >= 0) mockNoteLinks.splice(idx, 1);
      return undefined as T;
    }
    case 'list_egress_events':
      return [...mockEgress] as T;
    case 'list_note_reviews':
      return mockNoteReviews.filter((r) => r.noteId === args?.noteId) as T;
    case 'review_note': {
      const note = mockNotes.find((n) => n.id === args?.noteId);
      if (!note) throw new Error('note not found');
      const conviction = Number(args?.conviction);
      if (!(conviction >= 1 && conviction <= 5)) {
        throw new Error('conviction must be between 1 and 5');
      }
      const now = Date.now();
      const comment = typeof args?.comment === 'string' ? args.comment.trim() : '';
      mockNoteReviews.push({
        id: crypto.randomUUID(),
        noteId: note.id,
        conviction,
        comment: comment || null,
        reviewedAt: new Date(now).toISOString(),
      });
      const next = mockNextRevisit(conviction, now);
      let task: Task | null = null;
      if (args?.decision === 'drop') {
        note.status = 'dropped';
        note.revisitAt = null;
      } else if (args?.decision === 'promote') {
        note.status = 'promoted';
        note.revisitAt = next;
        task = await mockInvoke<Task>('save_task', {
          task: {
            text: `Validate: ${note.text.split('\n')[0]}`,
            rawText: note.text,
            improved: false,
            link: note.link,
            taskGroupId: null,
            source: {
              appId: 'app.blink.ideas',
              appName: 'Ideas',
              windowTitle: '',
              capturedAt: new Date(now).toISOString(),
            },
            originNoteId: note.id,
          } satisfies NewTask,
        });
      } else {
        if (note.status === 'dropped') note.status = 'open';
        note.revisitAt = next;
      }
      note.updatedAt = new Date(now).toISOString();
      return { note: mockWithReviews(note), task } as T;
    }
    case 'search_notes': {
      // Mirrors the FTS query: every word must prefix-match a word of the text, raw text,
      // or link.
      const words = String(args?.query ?? '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
      if (words.length === 0) return [] as T;
      return mockNotes
        .filter((n) => {
          const haystack = `${n.text} ${n.rawText} ${n.link ?? ''}`
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u);
          return words.every((w) => haystack.some((h) => h.startsWith(w)));
        })
        .map(mockWithReviews) as T;
    }
    case 'save_note': {
      const input = args?.note as NewNote;
      const now = new Date().toISOString();
      const note: Note = {
        id: crypto.randomUUID(),
        noteType: input.noteType,
        text: input.text,
        rawText: input.rawText.trim() ? input.rawText : input.text,
        link: input.link,
        topicId: input.topicId,
        improved: input.improved,
        conflict: false,
        status: 'open',
        revisitAt: mockFirstRevisit(input.noteType, Date.now()),
        convictionHistory: [],
        reviewNudge: null,
        title: null,
        excerpt: null,
        summary: null,
        enrichment: input.noteType === 'source' && input.link ? 'pending' : 'none',
        evidence: { supports: 0, contradicts: 0, related: 0 },
        source: input.source,
        createdAt: now,
        updatedAt: now,
      };
      mockNotes.unshift(note);
      return note as T;
    }
    case 'update_note': {
      const note = mockNotes.find((n) => n.id === args?.id);
      if (!note) throw new Error('note not found');
      if (typeof args?.text === 'string' && args.text !== note.text) {
        mockNoteRevisions.unshift({
          id: crypto.randomUUID(),
          noteId: note.id,
          text: note.text,
          reason: 'edit',
          createdAt: new Date().toISOString(),
        });
        note.text = args.text;
      }
      const noteType = args?.noteType;
      if (noteType === 'idea' || noteType === 'thought' || noteType === 'source') {
        note.noteType = noteType;
        if (note.revisitAt === null && note.status === 'open') {
          note.revisitAt = mockFirstRevisit(noteType, Date.now());
        }
      }
      if (typeof args?.link === 'string') note.link = args.link.trim() || null;
      if (typeof args?.topicId === 'string') note.topicId = args.topicId.trim() || null;
      if (typeof args?.improved === 'boolean') note.improved = args.improved;
      if (typeof args?.source === 'string') note.source = { ...note.source, appName: args.source };
      note.updatedAt = new Date().toISOString();
      return mockWithReviews(note) as T;
    }
    case 'delete_note': {
      const idx = mockNotes.findIndex((n) => n.id === args?.id);
      if (idx >= 0) mockNotes.splice(idx, 1);
      return undefined as T;
    }
    case 'note_history': {
      const note = mockNotes.find((n) => n.id === args?.id);
      if (note) note.conflict = false;
      return mockNoteRevisions.filter((r) => r.noteId === args?.id) as T;
    }
    case 'restore_note_revision': {
      const note = mockNotes.find((n) => n.id === args?.noteId);
      const revision = mockNoteRevisions.find((r) => r.id === args?.revisionId);
      if (!note || !revision) throw new Error('revision not found');
      return mockInvoke<T>('update_note', { id: note.id, text: revision.text });
    }
    case 'improve_note_text': {
      const topic = mockTopics.find((t) => t.id === args?.topicId);
      if (topic?.sensitivity === 'confidential') {
        throw new Error('AI is disabled for confidential topics');
      }
      mockEgressEvent('aiImprove', 'api.openai.com', String(args?.text ?? '').length);
      return String(args?.text ?? '') as T;
    }
    case 'export_notes': {
      // No native save dialog in the browser: download the file instead. Same selection
      // rule as the core: one topic explicitly, or everything minus confidential topics.
      const topicId = typeof args?.topicId === 'string' ? args.topicId : null;
      const topics = topicId
        ? mockTopics.filter((t) => t.id === topicId)
        : mockTopics.filter((t) => t.sensitivity !== 'confidential');
      const json = args?.format === 'json';
      const content = json
        ? JSON.stringify(
            topics.map((topic) => ({
              topic,
              notes: mockNotes.filter((n) => n.topicId === topic.id),
            })),
            null,
            2,
          )
        : topics
            .map(
              (topic) =>
                `## ${topic.name}\n\n${mockNotes
                  .filter((n) => n.topicId === topic.id)
                  .map((n) => `- ${n.text}`)
                  .join('\n')}`,
            )
            .join('\n\n');
      const fileName = `blink-ideas-mock.${json ? 'json' : 'md'}`;
      const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return fileName as T;
    }
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
      return mockShortcuts[mockCaptureMethod(args?.method)] as T;
    case 'set_capture_shortcut': {
      const method = mockCaptureMethod(args?.method);
      mockShortcuts[method] = String(args?.shortcut ?? '');
      return undefined as T;
    }
    case 'sync_now':
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
    case 'list_terminals':
      // Browser mock — a representative couple so the picker is developable.
      return [
        { name: 'Alacritty', command: 'alacritty -e tmux attach -t {session}' },
        { name: 'kitty', command: 'kitty tmux attach -t {session}' },
      ] as T;
    case 'list_editors':
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
          status: 'local',
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
    case 'list_worktree_pr_statuses': {
      // No real gh — after a short delay (so the loading state is visible), give every other
      // linked branch a PR status; the rest keep their local status.
      const repoPath = String(args?.repoPath ?? '');
      const prStates: WorktreeStatus[] = ['open', 'merged', 'draft', 'closed'];
      const map: Record<string, WorktreeStatus> = {};
      (mockWorktrees[repoPath] ?? [])
        .filter((w) => !w.isMain)
        .forEach((w, i) => {
          if (i % 2 === 0) map[w.branch] = prStates[i % prStates.length] as WorktreeStatus;
        });
      await new Promise((resolve) => setTimeout(resolve, 600));
      return map as T;
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

function mockCaptureMethod(value: unknown): CaptureMethod {
  return value === 'manual' || value === 'idea' ? value : 'copy';
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
