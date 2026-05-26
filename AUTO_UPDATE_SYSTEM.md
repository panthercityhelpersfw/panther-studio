# Auto Update System

Panther Studio uses Tauri's signed updater for installed Windows builds. Update checks are lazy and non-blocking: developer builds never initialize the native updater, and production checks run only after the React app has rendered.

## Runtime Flow

- Native plugin is compiled in only when `PANTHER_ENABLE_UPDATER=true`.
- Frontend checks run only when `VITE_PANTHER_UPDATER_ENABLED=true`.
- Manual and launch checks call `@tauri-apps/plugin-updater.check()`.
- Downloads call `update.download()`.
- Installs call `update.install()`, then `@tauri-apps/plugin-process.relaunch()`.
- Any check, download, or install failure is caught, boot-logged, and shown in Settings without stopping app startup.

## Files

- `src-tauri/tauri.conf.json`: updater public key and GitHub Releases endpoint.
- `src-tauri/src/lib.rs`: startup-safe native updater gate.
- `src/updater.ts`: lazy updater controller and error handling.
- `src/components/Preferences.tsx`: channel, auto-check, background download, install-on-close, manual check/download/install UI.
- `scripts/build-updater-release.cjs`: signed updater build.
- `scripts/make-latest-manifest.cjs`: Tauri `latest.json` generator.
- `scripts/serve-update.cjs`: local update feed for 0.1.0 -> 0.1.1 simulation.

## User Safety

The updater replaces the installed app only. It does not delete projects, presets, settings, IndexedDB audio blobs, or backups. Project data remains under the app data folders, outside the installer payload.

If an update fails, Panther Studio keeps the current installed version usable. Keep previous installers attached to every GitHub Release so users can manually roll back without touching project data.

## Build Modes

Developer build:

```powershell
npm run tauri:build
```

Updater is disabled and the UI shows `Developer build: updates disabled.`

Production updater build:

```powershell
npm run release:updater
npm run release:manifest
```

Updater is enabled, signed artifacts are generated, and Settings reports `Updates ready` when the updater is configured.
