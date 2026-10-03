import type { AuthResult } from '@/generated/AuthResult';
import type { AuthUser } from '@/generated/AuthUser';
import type { CaptureDraft } from '@/generated/CaptureDraft';
import type { EditorOption } from '@/generated/EditorOption';
import type { EgressEvent } from '@/generated/EgressEvent';
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
import type { NoteType } from '@/generated/NoteType';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { ReviewDecision } from '@/generated/ReviewDecision';
import type { ReviewOutcome } from '@/generated/ReviewOutcome';
import type { Sensitivity } from '@/generated/Sensitivity';
import type { Task } from '@/generated/Task';
import type { TaskEffort } from '@/generated/TaskEffort';
import type { TaskGroup } from '@/generated/TaskGroup';
import type { TerminalOption } from '@/generated/TerminalOption';
import type { Topic } from '@/generated/Topic';
import type { TopicStatus } from '@/generated/TopicStatus';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttentionUpdate } from '@/generated/WorktreeAttentionUpdate';
import type { WorktreeStatus } from '@/generated/WorktreeStatus';
import { mockInvoke } from '@/lib/mock';

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
  // The mock is untyped per command; this boundary is the one place it's narrowed.
  return mockInvoke(cmd, args) as Promise<T>;
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

export { isTauri };
