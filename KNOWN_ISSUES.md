# Known Issues & Limitations (Prompt 1 / Step 1)

This is the foundation step. The recording → waveform → playback → mix → save
loop is fully real and complete. The items below are intentional scope
boundaries or known rough edges to address in later steps.

## Scope boundaries (planned for later prompts)

- **Insert effects** (EQ, compressor, reverb, de-esser, gate) — not yet present.
  The signal chain already routes through per-track gain/pan and the master bus,
  so inserts drop in without rearchitecting. The Inspector says this explicitly
  rather than showing non-functional controls.
- **Mastering chain** — limiter/loudness normalization comes with the master FX
  step.
- **MP3 export** — only **WAV** mixdown export exists today. MP3 needs an encoder
  (e.g. an `lamejs`/wasm encoder or a Rust-side encoder); planned.
- **Auto-update is a scaffold** — the updater plugin is wired, but no signing key
  or release endpoint is configured, so "Check for updates" reports
  "Updater not configured". Enabling it is documented in
  `DESKTOP_APP_ARCHITECTURE.md`.

## Editing limitations

- Clips can be **moved** (with snap) but not yet **trimmed, split, or
  fade-edited** from the UI (the data model already supports `offsetSec`/
  `durationSec` for trimming).
- No clip copy/paste or comping UI yet (takes are stacked as separate clips).
- Undo/redo is not implemented.
- Tracks cannot be reordered by drag yet.

## Audio notes

- Recording container is **Opus/WebM** (whatever `MediaRecorder` supports), then
  decoded to PCM in memory. This is lossy at the capture stage; a future step can
  add a PCM/WAV capture path (e.g. AudioWorklet) for archival-quality takes.
- The `AudioContext` starts on first user gesture (browser autoplay policy). If
  the very first click is the Record button, mic permission + context resume can
  add a brief startup delay.
- Metering is RMS with light perceptual scaling — good for monitoring, not a
  calibrated dBFS peak meter. True peak/LUFS metering is a later refinement.
- Latency depends on the OS/driver; ASIO/low-latency driver selection is not yet
  exposed (WebView uses the default Windows audio path).

## Persistence notes

- Audio blobs live in IndexedDB. Very long sessions of high-bitrate takes can
  grow the store; `STORAGE_SYSTEM.md` describes a planned file-based option via
  the Tauri `fs` plugin for unbounded capacity.
- No project import/export to a portable file yet (projects are local to the
  machine's app-data store).

## Platform

- Targeted and configured for **Windows** (NSIS + MSI). macOS/Linux bundles are
  not configured in this step.
- First `tauri:dev` / `tauri:build` compiles the Rust backend, which takes a few
  minutes; subsequent builds are incremental.

## Minor UI

- No light theme (intentional — pro DAWs are dark).
- Window-close prompt relies on the browser `beforeunload`; a native confirm
  dialog can replace it later.
