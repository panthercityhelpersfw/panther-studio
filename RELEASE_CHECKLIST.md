# Release Checklist (Windows)

## Build & run

- **Dev (web preview):** `npm install` then `npm run dev` → http://localhost:1420
- **Dev (desktop):** `npm run tauri:dev`
- **Typecheck:** `npm run typecheck` (must be clean)
- **Production frontend build:** `npm run build` (runs `tsc --noEmit` + `vite build` → `dist/`)
- **Windows app + installer:** `npm run tauri:build` (requires Rust toolchain + WebView2). Produces NSIS `.exe` and MSI installers under `src-tauri/target/release/bundle/`.

## Tauri config (verified — `src-tauri/tauri.conf.json`)

- productName **Panther Studio**, identifier `com.pantherstudio.app`, version `0.1.0`.
- Bundle targets: **nsis** + **msi** (both Windows installers).
- App icon set present (`src-tauri/icons/`, incl. `icon.ico`).
- NSIS `installMode: currentUser` → no admin prompt; Start Menu + Desktop shortcuts created by the installer.
- Main window: 1440×900, min 1100×700, dark theme, resizable, centered.

## Versioning

- `package.json` and `tauri.conf.json` both at `0.1.0` — bump together per release.

## Updater readiness

- Updater plugin is wired (`tauri-plugin-updater`); `createUpdaterArtifacts: false` until a release feed + signing key are configured. The in-app "Check for updates" honestly reports when the updater isn't configured. See `AUTO_UPDATE_SYSTEM.md`.

## Local data paths

- Projects, audio blobs, settings, profiles, presets, and backups live in IndexedDB inside the WebView2 user-data dir under the app's local-data folder (shown in Preferences → Storage and the dashboard footer).

## Backup / recovery

- Continuous autosave + rolling per-project backups; crash heartbeat offers session recovery on next launch; corrupt projects auto-restore from the latest backup. Project bundles (`.panther`) provide manual, portable backups.

## Pre-release smoke test

1. Create a profile. 2. Audio Setup: pick mic. 3. Build a beat (typed). 4. Record/import a vocal. 5. Autotune + Clean. 6. Coach → Analyze. 7. Mix Assist. 8. Master to a target. 9. Save, close, reopen — verify everything restores. 10. Export WAV. 11. Freeze/bounce a track.
