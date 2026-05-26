# Full Project Architecture

Panther Studio is a Tauri 2 desktop app: a React/TypeScript front end (the whole
DAW) running in the OS WebView, with a thin Rust backend for the native shell,
installer, file dialogs, and updater.

```
┌───────────────────────────────────────────────────────────┐
│ Native window (Tauri / WebView2)                            │
│  React UI ─► Zustand store ─► AudioEngine (Web Audio)       │
│           └► IndexedDB (projects, blobs, backups, settings) │
│                         │ Tauri IPC (invoke)                │
│  Rust backend: app paths, write_binary_file, plugins        │
│   (dialog, fs, process, updater)                            │
└───────────────────────────────────────────────────────────┘
```

## Layers

### 1. Audio engine — `src/audio/`
Framework-agnostic. React never touches Web Audio nodes directly.

- `AudioEngine.ts` — the singleton engine: master sum bus → master chain →
  output gain → destination + meters; per-track input → EffectChain → gain → pan
  → analyser → master; mic input + monitoring; recording; clip/MIDI/pad/reference
  scheduling; metronome/count-in; tuner; loop; low-CPU mode; perf info.
- `effects/EffectChain.ts` — fixed-topology, click-free effect chain (gate, EQ,
  de-esser, compressor, saturation, doubler, delay, reverb, limiter). Reused for
  per-track **and** master.
- `effects/types.ts` — serializable `EffectsState` + defaults/normalizer.
- `effects/impulse.ts` — procedural reverb impulse generator.
- `presets.ts` / `masterPresets.ts` — vocal & master presets.
- `autoEnhance.ts` / `autoMaster.ts` — analysis → derived chains.
- `loudness.ts` — peak/RMS/clipping + approx K-weighted LUFS.
- `waveform.ts` — mono mixdown + min/max peak extraction.
- `export.ts` — offline render (full/region/stems) + WAV encode.

### 2. State — `src/state/`
- `types.ts` — the data model: `Project`, `Track`, `Clip` (audio/MIDI),
  `MidiNote`, `Marker`, `Pad`, `LoopRegion`, `MasterState`, `ReferenceTrack`,
  `AudioAsset`, `AppSettings`, meters.
- `store.ts` — the **single Zustand store**. Owns all app state and the side
  effects that drive the engine and persistence. One mutation chokepoint
  (`touchProject`) feeds undo/redo and autosave. Actions cover transport,
  tracks, clips, effects, presets, auto-enhance, import, pads, MIDI, markers,
  loop, grid, mixing, master, loudness, export, reference, preferences,
  recovery, and project management.

### 3. Persistence — `src/persistence/db.ts`
IndexedDB (stored in the WebView2 profile under the OS app-local-data dir):
`projects` (JSON), `blobs` (raw audio), `backups` (rolling snapshots), `settings`.
Functions for save/load/list/delete, blob CRUD + pruning, backups, storage
estimate, and full reset.

### 4. Tauri bridge — `src/tauri.ts`
Graceful desktop/browser bridge: `getAppPaths`, `ensureAppDirs`, `saveBlobFile`
(native save dialog + `write_binary_file`), `pickDirectory`, `writeBlobToDir`,
`checkForUpdates`. All degrade to browser behavior in the web preview.

### 5. UI — `src/components/` (40+ components)
- Shell: `App.tsx`, `TransportBar`, `StatusBar`, `ErrorBanner`, `BottomDock`.
- Arrange: `Arrange`, `EditToolbar`, `TrackHeader`, `Clip`.
- Docks: `Mixer`, `EffectsRack`, `MasterPanel`, `PadGrid`, `Analyzer`.
- Editors/widgets: `PianoRoll`, `Inspector`, `Knob`, `Meter`,
  `GainReductionMeter`, `ChainVisualizer`, `effectParams.ts`.
- Modals/panels: `Preferences`, `SetupWizard`, `RecoveryPrompt`, `HelpAbout`,
  `MicPanel`, `MonitorWarning`, `EnhanceReport`, `LoudnessReport`, `Dashboard`.

### 6. Rust backend — `src-tauri/src/`
- `main.rs` → `lib.rs::run()`.
- Commands: `get_app_paths`, `ensure_app_dirs`, `write_binary_file` (base64 →
  `std::fs::write` for native export, scope-free).
- Plugins: dialog, fs, process, updater (desktop).
- `setup()` eagerly creates the app data dir (first-save safety).

## Key data flow

```
UI event → store action → touchProject(mutator[, coalesceKey])
   → updates project (immutable) → pushes undo snapshot (coalesced)
   → marks dirty → schedules debounced autosave
   → applies the change to the AudioEngine (gain/pan/effects/master/loop…)
```

Playback: `play()` schedules `AudioBufferSourceNode`s (audio clips, with per-clip
gain + fade nodes) and synth voices (MIDI) into each track's input; the meter
loop advances the playhead from the audio clock and handles looping/end.

Persistence: project JSON is small (metadata + asset references); raw audio lives
as blobs. On open, blobs are decoded to `AudioBuffer`s and peaks rebuilt before
the timeline shows.

## Build & packaging
`npm run build` = `tsc --noEmit` + Vite → `dist/`. `npm run tauri:build` bundles
the Rust release binary + NSIS/MSI installers. See `WINDOWS_INSTALLER.md`.

## Design principles
- No fake systems: every control maps to a real audio parameter or stored field.
- Single source of truth (the store); the engine is stateless about "project".
- Click-free, leak-free audio: fixed effect topology, disciplined node disposal.
- Crash-safe: autosave + backups + heartbeat recovery + corruption fallback.
