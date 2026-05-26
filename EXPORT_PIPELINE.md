# Export Pipeline

Export renders the project **offline** through the exact same audio graph used
for playback, then writes a real audio file. Exports are sample-accurate and
include all processing.

## What gets rendered (`src/audio/export.ts`)

`renderProject()` builds an `OfflineAudioContext` and reconstructs the graph:

```
clip sources (gain + fades) -> track EffectChain -> track gain -> pan
   -> master EffectChain (unless bypassed) -> output gain -> destination
```

- **Timing**: each clip is scheduled at `startSec` (offset into the region),
  honoring `offsetSec`, `durationSec`, per-clip **gain**, and **fade in/out**.
  Muted clips are skipped. Output length matches the timeline exactly (plus a
  short tail for reverb/limiter release on full/region renders).
- **Effects**: every track's real `EffectChain` (EQ, comp, de-ess, saturation,
  doubler, delay, reverb, limiter) is rebuilt offline and applied.
- **Mastering**: the master chain + output gain are applied (unless bypassed),
  so the file matches what you hear.
- **Solo/mute**: respected for full/region renders.

## Export modes (MASTER tab)

| Mode | Function | Notes |
|------|----------|-------|
| **Full song (WAV)** | `renderMixdown` | Whole timeline through the master chain |
| **Loop region (WAV)** | `renderRegion(start,end)` | Exports just the loop region |
| **Stems (WAV)** | `renderStem` per track | Each audio track in isolation, **pre-master**, solo ignored |

## File format

- **WAV**: 16-bit PCM, stereo, 48 kHz (`encodeWav`). Always available and full
  quality. Peaks are clamped to ±1.0 on encode; the master limiter prevents
  unexpected overs.
- **MP3**: **not yet available.** It requires an encoder (ffmpeg.wasm or a JS
  encoder); to keep the desktop build lean and avoid shipping a large/uncertain
  dependency in this step, MP3 is deferred and documented honestly. WAV export is
  complete and lossless in the meantime.

## Saving the file (native dialog)

`src/tauri.ts`:

- **Desktop (Tauri)**: `saveBlobFile` opens the **native save dialog**
  (`@tauri-apps/plugin-dialog` `save()`), then writes bytes to the chosen path
  via a small Rust command `write_binary_file` (base64 transfer + `std::fs::write`).
  This avoids broad filesystem-scope grants — only the user-picked path is
  written.
- **Stems on desktop**: `pickDirectory()` asks for one folder; each stem is
  written into it (`write_binary_file`).
- **Browser preview**: falls back to a normal download (anchor + object URL), so
  export also works in the web preview.

## Verification

An automated in-browser test rendered a 2-track mix through Auto Master and
captured the exported bytes: the blob begins with `RIFF`/`WAVE`, is exactly the
expected size for the rendered length, and contains non-silent audio peaking
safely below full scale. Stem export produced one file per audio track.
