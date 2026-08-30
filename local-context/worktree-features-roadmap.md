# Blink Worktrees — feature roadmap

## The angle
Blink already launches Claude in a tmux session per worktree and reuses one terminal to
switch between them. That makes it uniquely positioned as a **command center for many
parallel Claude sessions**, wired into the task-capture half of the app. Two features nobody
else does well should anchor the roadmap; the rest is polish that makes the manager pleasant.

## Tier 1 — the differentiators
1. **Claude attention dashboard + notifications** — per worktree, detect whether its Claude
   is *working / waiting for your approval / done / errored* (by reading the tmux pane), show
   a status dot per row, a "needs you" badge on the Worktrees nav tab, and fire a **native
   notification** when one flips to "needs input" or "done." This is the flagship: parallel
   worktrees are only useful if you know *which one needs you*. Fits `TmuxCli::capture-pane` +
   the existing `platform/jobs` poll loop; notifications need a new plugin.

2. **Task → worktree** — from a captured task, one keystroke creates a `task/<slug>` branch +
   worktree and launches Claude **seeded with the task's (AI-improved) text as its prompt**;
   the task links to the worktree and auto-completes when its PR merges. This connects the two
   halves of Blink — it's the integration that makes Blink *Blink*.

## Tier 2 — strong workflow value
3. **Richer status** — ahead/behind base, dirty count, last commit + time, stale flag
   (`GitCli` plumbing).
4. **PR lifecycle** — `gh pr create`, PR/CI status on the row, open in browser, auto-suggest
   pruning merged branches (ties into the remote-delete we built).
5. **Quick actions** — open in editor, reveal in Finder, copy path/branch, open PR (cheap
   `platform/os` + shortcuts).

## Tier 3 — polish
Per-repo setup templates (the deferred `--up`), cross-repo "all worktrees" + search,
rename/move/lock, restart Claude, a "home" fallback session so deleting the last worktree
keeps the terminal alive.

## Recommended sequence
**#5 quick actions** (fast win, no deps) → **#3 richer status** (makes the list real) →
**#1 attention dashboard** (flagship, once rows carry state) → **#2 task→worktree** →
**#4 PR lifecycle** (enables #2's auto-complete).

## Decisions needed before building
- New deps: `tauri-plugin-notification` (#1) and relying on `gh` (#4).
- Default editor for quick-open (VS Code / Cursor / `$EDITOR`, or per-repo).
- Attention detection: start heuristic on the pane text, deepen later.
