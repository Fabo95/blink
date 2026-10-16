# Blink — daily-workflow roadmap, v4 (2026-10-14)

## Goal
Blink is the **one place** that shows everything important right now: Slack messages to me,
GitHub, BetterStack incidents, Linear tickets, my own captured tasks. You triage there, turn
items into tasks, and with one key turn a task into a ready worktree with Claude already
briefed. Parallel worktrees only if they cost no setup.

## What the data says (Claude history since Aug)
- ~2,550 prompts in the main monorepo checkout vs 75 in worktrees. Worktrees were dropped
  after Sep 7. The first prompt in a fresh worktree: *"What do I need to do to setup this
  worktree?"*
- The day is driven from outside: incidents, marketing/mobile/CS questions in Slack, Linear
  tickets. The work starts in Slack/BetterStack/Linear, and Claude is used to answer and build.
- The wrap-up ritual (`summarize` → `/create-ticket` → `ship`) already lives in repo skills.
  Blink doesn't duplicate it.

## Status
Phases 1–3 are built and installed. The loop is closed: something arrives → task → briefed
Claude in its own worktree → merged → task completed. Next: use it for a few days before
building more.

## Phase 1 — Friction-free worktrees ✅
- Per-repo setup command (`r` on the repo pill bar), run before Claude starts.
- `n` new worktree: `↑↓` picks a recent Claude conversation to fork
  (`--resume <id> --fork-session`). Reopening a worktree runs `claude --continue`.

## Phase 2 — Incoming ✅
Its own page (the start page), not a section of the Inbox. Keys: `o` open at source,
`m` move to the inbox as a task, `a` archive (back when it changes), `g` reload everything.
Background poll every 60 s; urgent items notify.

| Source | What shows | Auth |
| --- | --- | --- |
| GitHub | notifications, read + unread, last 14 days (review, mention, assign, author, comment, CI) | `gh` login |
| Linear | inbox notifications | personal API key |
| Slack | mentions incl. `@here`/`@channel`; DMs unread for 30+ min (urgent) | user token of a small own Slack app |
| Better Stack | unresolved incidents (urgent until acknowledged) | Uptime API token |

All keys live in the keychain, managed in Settings → Connections (one row per source + OpenAI,
showing the connected profile). Items stay device-local; Blink never marks anything read at
the source. Rows show the source's logo.

## Phase 3 — Task → worktree ✅
`w` on a task: pick repo, branch prefilled from the task, `⌘↵`. Writes a brief (AI prompt
with an OpenAI key, else task + link + group context), creates the worktree, runs setup,
starts Claude with the brief, opens the terminal, links task ↔ branch. Branch chip on the
task, task text on the worktree row. Merged PR → task completed.

## Loose ends
- Verify with real data: Slack `@here`/`@channel` matches and group-DM read position;
  Linear row text; Better Stack incident link (`o`).
- Slack app messages (Linear bot etc.) now fall back to attachments / blocks for the title —
  check it on the next build.
- Consistency leftovers: `e`/`o` mean different things on Worktrees; popover widths vary;
  the terminal / editor pickers in Settings are mouse-only.

## Later, only once worktrees are a habit
A global hotkey that jumps to the Claude session waiting on you ("your turn").

## Not doing
Standup/worklog, review queue as a separate page (GitHub review requests already show up in
Incoming), two-way Slack/Linear sync, replying to Slack from Blink, wrap-up automation
(repo skills), OAuth (personal keys are enough).
