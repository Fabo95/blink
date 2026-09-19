---
name: run-blink
description: Build the Blink desktop app from the current working tree as a release bundle, install it to /Applications, and launch it — killing any running instance first. Use when asked to build, run, start, restart, reinstall, or "see" Blink in the real app on this Mac.
---

# Run Blink

Turns the current working tree into the `Blink.app` that lives in `/Applications` and
starts it. macOS only — the bundle target and the install path are Mac-specific.

Run every step from the repo root (`/Users/fabianhinz/repositories/blink`). Stop and
report at the first failure; don't skip ahead to launch a stale bundle.

## 1. Kill the running instance

The app holds an open SQLCipher handle, so ask it to quit before pulling the rug out.

```bash
osascript -e 'quit app "Blink"' 2>/dev/null
sleep 1
pkill -f '/Applications/Blink.app/Contents/MacOS/blink'
pkill -f 'target/release/blink'
pkill -f 'target/debug/blink'
pkill -f 'tauri dev'
```

Every `pkill` here is anchored to an executable path. **Never widen it to `pkill -f
blink`** — the repo path contains "blink", so that pattern matches unrelated processes
(including the shell running this skill).

Also stop any `pnpm tauri dev` / `pnpm dev` background task this session started, so it
can't respawn Vite on port 1420.

Confirm nothing survived:

```bash
pgrep -fl '/Applications/Blink.app/Contents/MacOS/blink|target/(debug|release)/blink' || echo "clean"
```

## 2. Build the release bundle

**Export `BLINK_SERVER_URL` first, or you ship a localhost build.** `core/config.rs`
resolves the sync server as runtime env → `option_env!("BLINK_SERVER_URL")` → the
`http://localhost:8787` default. `option_env!` reads *cargo's own environment at compile
time*; it does not read `.env`. And the dotenvy load in `lib.rs` is
`#[cfg(all(desktop, debug_assertions))]`, so a release bundle never sees the file either.
Build without the var and the app silently points at localhost.

```bash
test -f apps/desktop/src-tauri/.env || { echo "missing apps/desktop/src-tauri/.env"; exit 1; }
set -a; . apps/desktop/src-tauri/.env; set +a
test -n "$BLINK_SERVER_URL" || { echo "BLINK_SERVER_URL unset"; exit 1; }
echo "building against $BLINK_SERVER_URL"
pnpm tauri build --bundles app
```

`build.rs` declares `cargo:rerun-if-env-changed=BLINK_SERVER_URL`, so changing the value
does force a rebuild — a stale binary is not a failure mode here.

- `--bundles app` skips the `.dmg` — nothing here needs an installer.
- Tauri's `beforeBuildCommand` is `pnpm build`, i.e. `tsc --noEmit && vite build`. **A
  type error fails the build.** That is the gate, not a nuisance: fix it, don't work
  around it.
- Incremental builds land in ~20s. A cold release build compiles SQLCipher, OpenSSL and
  objc2 from source and takes several minutes — say so up front rather than letting it
  look hung.

The last lines name the bundle:

```
Finished 1 bundle at:
    …/apps/desktop/src-tauri/target/release/bundle/macos/Blink.app
```

## 3. Install to /Applications

`/Applications` is group-writable by `admin`, so no `sudo`. Copy to a staging name
first — if the copy fails halfway, the old app is still there.

```bash
SRC=apps/desktop/src-tauri/target/release/bundle/macos/Blink.app
ditto "$SRC" /Applications/Blink.app.new \
  && rm -rf /Applications/Blink.app \
  && mv /Applications/Blink.app.new /Applications/Blink.app
```

Use `ditto`, not `cp -R`: it preserves the bundle's metadata and the ad-hoc code
signature. A locally built bundle carries no quarantine attribute, so Gatekeeper does
not prompt.

## 4. Launch and verify

```bash
open -a /Applications/Blink.app
sleep 2
pgrep -f '/Applications/Blink.app/Contents/MacOS/blink'
```

A PID means the window is up. No PID means it crashed on start — get the reason from

```bash
log show --predicate 'process == "blink"' --last 2m --style compact | tail -30
```

Then prove the right server got baked in — the failure this catches is silent, the app
just fails to sign in:

```bash
strings /Applications/Blink.app/Contents/MacOS/blink | grep -c "$BLINK_SERVER_URL"
```

Zero hits means step 2 ran without the env var. Rebuild; don't hand over the bundle.

## 5. Report what to look at

Launching proves the entrypoint resolves; it does not prove the change works. Close the
loop by telling the user which keys to press for whatever just changed, and flag the two
gates they will hit before the inbox:

- **Sign-in** — needs the sync server (`docker compose up -d`) unless a session token is
  already in the keychain (service `app.blink.desktop`, account `sync-session-token`).
- **Vault unlock** — master password + Secret Key on a device that has synced before.

To exercise webview-only changes without a server, `pnpm desktop` runs the UI against the
in-memory browser mock in `src/lib/api.ts`. That is a different app instance, not the
bundle — say which one you started.
