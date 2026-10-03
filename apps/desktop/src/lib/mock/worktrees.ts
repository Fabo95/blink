/** Browser mock: managed repos, worktrees, their sessions, and the editor / terminal settings. */

import type { ManagedRepo } from '@/generated/ManagedRepo';
import type { PruneCandidate } from '@/generated/PruneCandidate';
import type { Worktree } from '@/generated/Worktree';
import type { WorktreeAttention } from '@/generated/WorktreeAttention';
import type { WorktreeAttentionUpdate } from '@/generated/WorktreeAttentionUpdate';
import type { WorktreeStatus } from '@/generated/WorktreeStatus';
import type { MockHandlers } from './types';

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

export const worktreeHandlers: MockHandlers = {
  get_worktree_base_dir: async () => {
    return mockWorktreeBaseDir;
  },
  set_worktree_base_dir: async (args) => {
    const path = typeof args?.path === 'string' ? args.path.trim() : '';
    mockWorktreeBaseDir = path ? path : null;
    return undefined;
  },
  pick_worktree_base_dir: async () => {
    // No native dialog in the browser — prompt for a path so the flow is developable.
    const picked = window.prompt('Mock folder picker — enter a base directory (empty cancels)');
    const value = picked?.trim() ?? '';
    if (!value) return null;
    mockWorktreeBaseDir = value;
    return value;
  },
  get_worktree_terminal: async () => {
    return mockWorktreeTerminal ?? DEFAULT_TERMINAL_COMMAND;
  },
  set_worktree_terminal: async (args) => {
    const command = typeof args?.command === 'string' ? args.command.trim() : '';
    mockWorktreeTerminal = command ? command : null;
    return undefined;
  },
  list_terminals: async () => {
    // Browser mock — a representative couple so the picker is developable.
    return [
      { name: 'Alacritty', command: 'alacritty -e tmux attach -t {session}' },
      { name: 'kitty', command: 'kitty tmux attach -t {session}' },
    ];
  },
  list_editors: async () => {
    // Browser mock — a representative couple so the picker is developable.
    return [
      { name: 'VS Code', command: 'code {path}' },
      { name: 'Cursor', command: 'cursor {path}' },
    ];
  },
  get_worktree_editor: async () => {
    return mockWorktreeEditor ?? DEFAULT_EDITOR_COMMAND;
  },
  set_worktree_editor: async (args) => {
    const command = typeof args?.command === 'string' ? args.command.trim() : '';
    mockWorktreeEditor = command ? command : null;
    return undefined;
  },
  open_worktree_in_editor: async () => {
    // No real editor in the browser — nothing to launch.
    return undefined;
  },
  list_managed_repos: async () => {
    return [...mockManagedRepos];
  },
  remove_managed_repo: async (args) => {
    const path = String(args?.path ?? '');
    mockManagedRepos = mockManagedRepos.filter((r) => r.path !== path);
    return [...mockManagedRepos];
  },
  pick_managed_repo: async () => {
    // No native dialog in the browser — prompt for a path so the flow is developable.
    const picked = window.prompt('Mock folder picker — enter a repo path (empty cancels)');
    const path = picked?.trim() ?? '';
    if (path && !mockManagedRepos.some((r) => r.path === path)) {
      const name = path.split('/').filter(Boolean).pop() ?? path;
      mockManagedRepos.push({ name, path, baseBranch: null });
      mockWorktrees[path] ??= [];
    }
    return [...mockManagedRepos];
  },
  list_worktrees: async (args) => {
    return [...(mockWorktrees[String(args?.repoPath ?? '')] ?? [])];
  },
  add_worktree: async (args) => {
    const repoPath = String(args?.repoPath ?? '');
    const branch = String(args?.branch ?? '').trim();
    if (!branch) throw new Error('branch is empty');
    const list = mockWorktrees[repoPath] ?? [];
    mockWorktrees[repoPath] = list;
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
    return worktree;
  },
  remove_worktree: async (args) => {
    const repoPath = String(args?.repoPath ?? '');
    const branch = String(args?.branch ?? '');
    const list = mockWorktrees[repoPath];
    if (list) {
      const idx = list.findIndex((w) => w.branch === branch);
      if (idx >= 0) list.splice(idx, 1);
    }
    return undefined;
  },
  prune_worktrees: async (args) => {
    // Mock: treat clean, non-live worktrees as "gone" candidates.
    const repoPath = String(args?.repoPath ?? '');
    const apply = args?.apply === true;
    const list = mockWorktrees[repoPath] ?? [];
    const candidates: PruneCandidate[] = list
      .filter((w) => !w.isMain && !w.isDirty && !w.sessionLive)
      .map((w) => ({ branch: w.branch, reason: 'upstream gone' }));
    if (apply) {
      mockWorktrees[repoPath] = list.filter((w) => !candidates.some((c) => c.branch === w.branch));
    }
    return candidates;
  },
  open_worktree_in_terminal: async (args) => {
    const list = mockWorktrees[String(args?.repoPath ?? '')];
    const worktree = list?.find((w) => w.branch === String(args?.branch ?? ''));
    if (worktree) worktree.sessionLive = true;
    return undefined;
  },
  list_worktree_pr_statuses: async (args) => {
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
    return map;
  },
  get_worktree_attention: async () => {
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
    return out;
  },
};
