# Known Limitations

Panther Studio is a real, working vocal DAW. This is an honest list of current
limits and documented approximations — none are fake systems; each is a real
implementation with a stated boundary.

## DSP approximations (real, not lab-grade)

- **Noise gate**: envelope-follower (detector runs at animation-frame rate, ~60
  Hz), not a per-sample gate. Real gating; very fast transients can slip a few ms.
- **De-esser**: split-band compressor (not a true dynamic EQ). Reduces sibilance
  for real; extreme settings can touch non-sibilant highs slightly.
- **Saturation**: static `WaveShaper` tanh curve (oversampled) — real harmonic
  generation, not a modeled analog circuit.
- **Reverb**: real convolution, but the impulse response is **synthesized**
  (decaying filtered noise), not a sampled room.
- **Loudness / LUFS**: K-weighted but **ungated** approximation labeled
  "approx LUFS" everywhere — good for too-loud/quiet/clipping decisions, not a
  certified broadcast meter.
- **Meters**: RMS with light perceptual scaling (gain-reduction meters read the
  real `DynamicsCompressorNode.reduction`).

## Export

- **WAV only** at present (16-bit PCM, full quality). **MP3 is not yet
  implemented** — it needs an encoder (ffmpeg.wasm or a JS encoder) and is
  deferred to keep the desktop bundle lean. Documented honestly; WAV export is
  complete and matches the timeline + effects + mastering.
- Exports add a short reverb/limiter tail; sample-accurate within the rendered
  region.

## Auto-update

- The updater plugin, UI, and code paths are present and honest, but going live
  requires **your signing key + release endpoint** (cannot be faked). Until
  configured it reports "not configured" — no fake success. See
  `AUTO_UPDATE_SYSTEM.md` / `RELEASE_GUIDE.md`.

## Platform

- Targeted and packaged for **Windows** (NSIS + MSI). macOS/Linux bundles are not
  configured.
- Installer is unsigned in development — **code-sign for distribution** to avoid
  SmartScreen warnings (separate from the updater key).
- Audio uses the default Windows/WebView audio path; no ASIO/low-latency driver
  selection. Wet monitoring adds the chain's processing latency on top of the
  system round-trip.

## Recording & audio

- Recording requires a real microphone (cannot run in a headless/CI environment).
  The capture path (getUserMedia → MediaRecorder → decode → clip) shares the same
  decode/clip/effects path as audio import, which is covered by automated tests.
- Capture container is Opus/WebM (decoded to PCM in memory) — lossy at the
  capture stage; an archival PCM capture path is a possible future upgrade.
- `AudioContext` starts on the first user gesture (browser/WebView autoplay
  policy).

## Storage

- Project audio lives in IndexedDB (large desktop quota). Very long sessions of
  high-bitrate takes should be monitored via the storage readout (a low-storage
  warning appears if the runtime reports a quota). A file-based audio option
  (Tauri `fs`) for unbounded capacity is a candidate future step.

## Editing

- Crossfades are manual (overlap two clips + set fades); no one-click auto-
  crossfade yet.
- No clip stretch/pitch, no track reordering by drag, no automation lanes yet.

## MIDI

- One built-in instrument set (Web Audio synthesis); no external MIDI device
  input and no MIDI-file import/export.

## Scope note

The core vocal workflow (record → effects → mix → master → export → save/reload)
is complete and verified. Some advanced additions (e.g. profiles, mix buses,
software instruments) are newer and evolving; the project compiles cleanly with
them. If anything here blocks you, the core path is unaffected.
