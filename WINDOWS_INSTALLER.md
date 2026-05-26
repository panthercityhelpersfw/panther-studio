# Windows Installer

Panther Studio ships as a real, installable Windows desktop app built with
Tauri 2. Building produces both an **NSIS `.exe` setup** and an **MSI**.

## App identity

Configured in `src-tauri/tauri.conf.json`:

- **Product name**: `Panther Studio` (window title + shortcuts + Add/Remove Programs).
- **Identifier**: `com.pantherstudio.app` (controls the app-data folder path).
- **Publisher**: `Panther Studio` — change `bundle.publisher` to your real
  company/name before release (it's a placeholder you can configure).
- **Version**: `0.1.0` — keep `package.json` `version` and `tauri.conf.json`
  `version` in sync (see Versioning below).
- **Icon**: generated set in `src-tauri/icons` (`.ico` + PNGs). Replace
  `src-tauri/app-icon.png` (1024×1024) and run the icon command to rebrand.

## Build

```bash
npm run tauri:build
```

This runs `npm run build` (typecheck + Vite production bundle into `dist/`), then
compiles the Rust backend in release and bundles installers into:

```
src-tauri/target/release/bundle/
  nsis/Panther Studio_<version>_x64-setup.exe
  msi/Panther Studio_<version>_x64_en-US.msi
```

## What the installer does

`bundle.windows.nsis` is configured for:

- **Per-user install** (`installMode: currentUser`) — no admin/UAC prompt.
- **Start Menu** entry and **Desktop shortcut**.
- An **uninstaller** (Add/Remove Programs / Apps & features).
- English language UI.

The MSI target is also produced (via WiX) for environments that prefer MSI
deployment / group policy.

## Prerequisites (build machine)

- Node.js 18+ and Rust (stable) with the MSVC toolchain ("Desktop development
  with C++").
- WebView2 Runtime is present on Windows 10/11; the installer also handles the
  runtime per Tauri defaults.

## App data directory

Resolved at runtime (shown in Preferences → Storage):

- `%APPDATA%\com.pantherstudio.app\` — app-data (created eagerly on first launch
  so the first save can't fail; used for exports/backups location info).
- `%LOCALAPPDATA%\com.pantherstudio.app\` — app-local-data; the WebView2 profile
  here holds the IndexedDB store (projects, audio blobs, backups, settings).

See `STORAGE_SYSTEM.md` for the persistence model.

## Versioning

1. Bump `version` in **both** `package.json` and `src-tauri/tauri.conf.json`.
2. Rebuild — the installer filenames, Add/Remove Programs entry, and the version
   shown in Preferences all read from this.
3. For auto-update, the updater compares this version to the release feed (see
   `AUTO_UPDATE_SYSTEM.md` / `RELEASE_GUIDE.md`).

## Code signing (recommended for distribution)

Unsigned installers trigger SmartScreen warnings. For production, sign the
`.exe`/`.msi` with an Authenticode certificate (configure
`bundle.windows.certificateThumbprint` / signing env vars). This is separate from
the **updater** signing key (see `AUTO_UPDATE_SYSTEM.md`).
