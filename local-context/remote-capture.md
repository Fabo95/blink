# Remote capture — speak a task into Blink

**Built.** `POST /v1/capture` files a task into your replica; the desktop pulls it into the
inbox on the next sync cycle (≤15s when the app is active, up to ~2 min when it has backed off).

```
iOS Shortcut (Siri dictation)
  → POST /v1/capture   Authorization: Bearer <session>   { "text": "…", "via": "Siri" }
  → server synthesizes a full task row into `records`
  → desktop pulls, merges like any other record → inbox
```

No desktop code knows this endpoint exists — a captured row arrives through the existing
pull/merge path. This only works because the server can read the replica; a zero-knowledge
server could not synthesize a task row.

## 1. Get your token

`/v1/capture` uses the **same session bearer as every other route** — one auth path, no second
credential type. Your desktop's token is already in the macOS keychain:

```bash
security find-generic-password -s app.blink.desktop -a sync-session-token -w
```

It doesn't rotate: Better Auth refreshes a session by updating the row keyed by the *same*
token value, only moving `expiresAt`. And every authenticated request rolls that expiry forward
— including the desktop's own sync polls — so the token stays valid as long as you use Blink.

Smoke-test it before touching the phone:

```bash
SESSION=$(security find-generic-password -s app.blink.desktop -a sync-session-token -w)

curl -sX POST https://blink.wolkenassistent.de/v1/capture \
  -H "Authorization: Bearer $SESSION" \
  -H 'content-type: application/json' \
  -d '{"text":"test from curl","via":"curl"}'
```

That task should appear in the inbox within ~15 seconds.

> **Treat this token as your account.** It can also read every task (`/v1/sync/pull`) and reach
> `/v1/auth/*`. Since it's going into a Shortcut — which syncs via iCloud and is shareable by
> link — don't share that Shortcut with anyone. If it ever leaks, sign out on the desktop
> (`⌘⇧O`), which invalidates the session, then re-copy the new one.

## 2. Build the Shortcut (iPhone)

Shortcuts app → **+** → name it **Blink**. The name *is* the Siri phrase, so keep it short and
distinctive — "Hey Siri, Blink".

Add two actions, in order:

**① Dictate Text**
- Language: whichever you'll speak. Set it explicitly rather than leaving it on the system
  default if you switch languages.
- *Stop Listening*: **After Pause** (the default). "On Tap" would defeat the hands-free point.

**② Get Contents of URL**
- URL: `https://blink.wolkenassistent.de/v1/capture`
- Method: **POST**
- Headers: `Authorization` → `Bearer <paste the token>`
- Request Body: **JSON**
  - `text` (Text) → the **Dictated Text** variable from ①
  - `via` (Text) → `Siri`

That's the whole body — the server derives the group, effort and link from what you said.

Optionally add **③ Show Notification** with "Captured" so you get confirmation without opening
Blink. Leave it out if you'd rather it be silent.

Then: **"Hey Siri, Blink"** → speak → it's in your inbox.

### Speaking the details

The server runs the note through OpenAI (`gpt-4o-mini`, the same model the desktop's ⌘I uses),
so you can dictate the filing instructions and they land in the right fields instead of in the
task text:

> "add buy a new keyboard to my errands group, it's a quick one"

→ text `Buy a new keyboard`, group **Errands**, effort **quick**.

- **It extracts, it doesn't infer.** A field is filled only when you actually said it. "Buy
  milk" gets no effort label, because nothing in the note is about effort — say "it's a quick
  one" and it does. A note about groceries doesn't land in an "Errands" group on topic
  similarity alone; you have to name the group.
- **Groups are matched against your real ones** — the server reads them off the `kind` generated
  column and hands the model that list, so it can only pick a name you actually have. Anything
  else resolves to empty.
- **Unstated fields stay empty**, which for effort means the app's normal "standard" — i.e.
  unlabelled, exactly as if you'd typed the task in yourself.
- **If the model is down, slow or returns nonsense, the note is filed verbatim.** A capture is
  never lost to the model being unavailable — check the server log for `could not parse the
  note` if a task arrives unpolished. The call retries transient failures (429/5xx/network)
  with jittered backoff inside a 15s total budget, and a circuit breaker skips it entirely for
  60s after a run of failures, so an OpenAI outage costs you fast plain captures rather than
  slow ones.
- `raw_text` keeps the note exactly as spoken, so the original survives the rewrite.

The request body is just `{ text, via }` — deliberately. Everything else is derived, because the
caller is a dictation button: it can't know a group UUID, and anything you'd want to state
explicitly you can simply say out loud.

## What the server fills in

`CaptureService.capture` builds a whole `TaskBody` so the desktop needs no special case:

- `status: 'inbox'`, `deleted: false`, and `improved: true` when the model cleaned the text
  (so the inbox doesn't offer `⌘I` on something already polished)
- source triple `app_id: 'app.blink.remote'`, `app_name: <via>`, `window_title: 'remote capture'`
  — `CaptureSource` is a struct, not an enum, so this needed no model change
- HLC `{ physical: Date.now(), counter: 0, nodeId: 'server-capture' }` — the server is just
  another writer in the LWW scheme
- `position: unix seconds`, which reliably lands it on top: local positions are small
  `MAX(position) + 1` integers and the inbox sorts descending

## Why not the Gemini app

The consumer Gemini app can only reach a custom endpoint through **Gemini Spark → Connected
Apps → custom MCP server**, which requires a personal Google account, 18+, **being in the US**,
English only — and **Spark is unavailable in the EEA, UK, Switzerland and Nigeria**. From
Germany there is no supported path from the Gemini app to a self-hosted endpoint, and building
an MCP server wouldn't change that: the app won't connect to it.

If you want a model in the loop anyway, the **Gemini API** has no such gate. A small relay
between the Shortcut and `/v1/capture` can send the dictated text to Gemini for rewriting and
effort estimation before filing it — same speaking experience, better phrasing. A Telegram bot
taking voice notes is the variant where you literally open an app and talk to it.

If Spark ever opens up in the EEA, `/v1/capture` is already the right thing to wrap in an MCP
server, and `better-auth` ships an `mcp` plugin providing the OAuth + Dynamic Client
Registration Google's connector expects.

## Worth knowing

- **No rate limiting** on `/v1/capture` beyond the session check. Fine behind Caddy for personal
  use; worth adding if the endpoint is ever exposed more widely.
- **`settings` still doesn't sync** (managed repos, worktree base dir, terminal/editor choice),
  so "new Mac, sign in, everything's there" isn't true yet regardless of this.
