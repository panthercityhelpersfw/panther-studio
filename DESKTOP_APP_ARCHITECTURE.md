# Desktop App Architecture

Panther Studio is a **Tauri 2** desktop application. The UI is a web front end
(React/TS/Vite) rendered inside the OS WebView (WebView2 on Windows), and a thin
**Rust** backend provides the native window, installer, filesystem access, and
auto-update plumbing.

```
┌──────────────────────────────────────────────────────────┐
│  Native window (Tauri / WebView2)                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  React UI  ─ Zustand store ─ Web Audio engine       │  │
│  │            ─ IndexedDB (projects + audio blobs)      │  │
│  └───────────────┬────────────────────────────────────┘  │
│                  │ Tauri IPC (invoke)                      │
│  ┌───────────────▼────────────────────────────────────┐  │
│  │  Rust backend (src-tauri)                            │  │
│  │   • get_app_paths / ensure_app_dirs commands         │  │
│  │   • plugins: dialog, fs, process, updater            │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Why Tauri

- Small binaries (uses the OS WebView instead of bundling Chromium).
- Real native installer (NSIS / MSI), Start Menu + Desktop shortcuts.
- First-class auto-updater.
- Rust backend for anything the web sandbox can't do (true filesystem, native
  dialogs, process control).

## Front end

- **React 18 + TypeScript + Vite** for the UI and build.
- **Tailwind** for the dark, pro-DAW styling.
- **Zustand** (`src/state/store.ts`) as the single source of truth: project
  model, transport, mixer, mic, meters, and UI state. The store also owns the
  side effects that drive the audio engine and persistence.
- The audio engine (`src/audio/AudioEngine.ts`) is a framework-agnostic
  singleton; React never touches Web Audio nodes directly.

## Rust backend (`src-tauri`)

- `src/main.rs` → `src/lib.rs::run()` builds the Tauri app.
- Registered plugins:
  - `tauri-plugin-dialog` — native open/save dialogs (used by export flows).
  - `tauri-plugin-fs` — scoped filesystem access to the app data dir.
  - `tauri-plugin-process` — relaunch (used by the updater flow).
  - `tauri-plugin-updater` (desktop only) — auto-update.
- Commands exposed to the UI:
  - `get_app_paths` — returns `app_data_dir`, `app_local_data_dir`,
    `app_config_dir`, and the app version.
  - `ensure_app_dirs` — creates the data directory on first run so saves never
    fail.
- `setup()` eagerly creates the app data dir at launch (crash-safe first save).

## Permissions / capabilities

`src-tauri/capabilities/default.json` grants the `main` window a least-privilege
set: core window controls, dialog, scoped app-data filesystem read/write,
process, and updater. Add scopes here as new native features are introduced.

## Window

Configured in `tauri.conf.json` → `app.windows[0]`:

- Title **Panther Studio**, label `main`, 1440×900 (min 1100×700), centered,
  dark theme, resizable.
- `security.csp` is `null` in the Tauri config; the HTML `<meta>` CSP in
  `index.html` restricts sources while still allowing `blob:`/`data:` media
  (needed for recorded-audio playback) and the Tauri IPC origin.

## Packaging (Windows)

`tauri.conf.json` → `bundle`:

- `targets: ["nsis", "msi"]` → both an NSIS `.exe` setup and an `.msi`.
- `icon` points at the generated icon set (`.ico` + PNGs).
- NSIS `installMode: currentUser` → no admin prompt; per-user install with
  Start Menu + Desktop shortcuts and an uninstaller.
- Output: `src-tauri/target/release/bundle/{nsis,msi}/…`.

`npm run tauri:build` runs `npm run build` first (typecheck + Vite production
build into `dist/`), then bundles the Rust binary and installers.

## Auto-update architecture (scaffold)

The updater plugin is **wired and ready**; publishing updates requires three
config steps (documented so a later prompt can flip it on):

1. **Generate a signing key** (once):
   ```bash
   npx tauri signer generate -w ~/.panther-studio.key
   ```
2. **Configure `tauri.conf.json`**:
   - Set `bundle.createUpdaterArtifacts: true`.
   - Add a `plugins.updater` block:
     ```json
     "plugins": {
       "updater": {
         "pubkey": "<public key from step 1>",
         "endpoints": ["https://your-host/panther/{{target}}/{{current_version}}"]
       }
     }
     ```
3. **Release flow**: build with the private key in `TAURI_SIGNING_PRIVATE_KEY`,
   upload the generated `latest.json` + signed bundles to the endpoint.

At runtime the front end calls `checkForUpdates()` (`src/tauri.ts`), which uses
`@tauri-apps/plugin-updater`'s `check()`. The Dashboard's "Check for updates"
button exercises this path; until endpoints are configured it reports
"Updater not configured", which is expected during early development.

## Storage location

IndexedDB (the audio + project store) physically lives under the WebView2
user-data directory inside the OS **app-local-data** folder — a real, per-user,
crash-safe location, not browser session storage. The exact path is shown on the
Dashboard via `get_app_paths`. See `STORAGE_SYSTEM.md`.
