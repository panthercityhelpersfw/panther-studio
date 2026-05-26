# Setup Guide

How to install prerequisites, run Panther Studio in development, and build the
Windows installer.

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ (tested on 24) | https://nodejs.org |
| Rust + Cargo | stable (tested 1.95) | https://rustup.rs |
| MSVC C++ Build Tools | latest | Visual Studio Installer → "Desktop development with C++" |
| WebView2 Runtime | latest | Pre-installed on Windows 10/11 |

Verify:

```bash
node --version
cargo --version
rustc --version
```

## 2. Install dependencies

```bash
npm install
```

## 3. Run

### Desktop app (recommended)

```bash
npm run tauri:dev
```

Opens Panther Studio in a native window with hot reload. First run compiles the
Rust backend (a few minutes); later runs are fast.

### Web preview (fast UI iteration, no native shell)

```bash
npm run dev      # http://localhost:1420
```

Everything works except native-only bits (native save dialog, app paths, real
updater). Projects persist in IndexedDB either way.

## 4. Build the Windows installer

```bash
npm run tauri:build
```

Produces:

```
src-tauri/target/release/bundle/nsis/Panther Studio_0.1.0_x64-setup.exe
src-tauri/target/release/bundle/msi/Panther Studio_0.1.0_x64_en-US.msi
```

Run the `.exe` to install. The app appears in the Start Menu and on the Desktop;
uninstall from Apps & features.

## 5. First-run setup (in the app)

A **Setup Wizard** appears on first launch:

1. **Welcome** — overview.
2. **Microphone** — click *Enable microphone*, pick your input device, then
   **calibrate**: sing/speak at performance volume and adjust input gain until
   the meter sits in the green/amber range (the wizard gives a live
   recommendation).
3. **Safety** — only enable input monitoring with **headphones** (avoids
   feedback). Monitoring is off by default.

You can reopen all of this later via **⚙ Settings** (Preferences) and **🎙 Input**.

## 6. Quality-of-life

- Change the autosave interval, accent color, low-CPU mode, and update settings
  in **Preferences**.
- Press **?** (top bar) for the shortcut & help panel.
- Regenerate the app icon: edit `src-tauri/app-icon.png` (1024×1024) and run
  `node scripts/gen-icon.cjs && npx tauri icon src-tauri/app-icon.png`.

## Troubleshooting

- **No microphone / permission denied**: re-open **🎙 Input**, click Enable, and
  allow access in Windows privacy settings. A banner appears if the mic is lost.
- **First build is slow**: the Rust release compile is one-time; subsequent
  builds are incremental.
- **SmartScreen warning on install**: the installer is unsigned in dev — sign it
  for distribution (see `WINDOWS_INSTALLER.md`).
