# Audio Architecture

All audio is **real** Web Audio API processing. There is no faked metering, no
placeholder playback, and no simulated recording. The engine lives in
`src/audio/AudioEngine.ts` as a single long-lived `AudioContext` graph; React
components and the Zustand store call into it but never own nodes.

## Signal graph

```
                         ┌──────── per track ────────┐
 BufferSource(clip) ──▶ trackGain ─▶ stereoPanner ─▶ trackAnalyser ─┐
 BufferSource(clip) ──▶    (mute/solo applied here)                  │
                                                                     ▼
 mic ─▶ inputGain ─┬─▶ inputAnalyser (input meter)               masterGain ─▶ destination
                   ├─▶ monitorGain ──────────────────────────────▲  │
                   │     (0 unless monitoring on)                    └─▶ splitter ─▶ L/R analysers
                   └─▶ MediaStreamDestination ─▶ MediaRecorder         (master stereo meter)
                              (records the gain-applied signal)
```

### Master bus

- `masterGain` → `AudioContext.destination` (audible output).
- `masterGain` also fans out to a `ChannelSplitter` → two `AnalyserNode`s for the
  **stereo master meter** (independent L/R RMS).

### Tracks

Each track lazily gets a node chain: `GainNode → StereoPannerNode →
AnalyserNode → master`. The analyser drives the per-track meter. Mute and solo
are not separate nodes — the store computes an **effective gain** and writes it to
the track `GainNode`, so toggling mute/solo is sample-accurate and works during
playback.

`effectiveGain(track) = muted ? 0 : (anySolo && !soloed ? 0 : track.gain)`.

### Clips / playback

`play(positionSec)` schedules one `AudioBufferSourceNode` per clip that overlaps
the playhead:

- `when = ctx.currentTime + max(0, clip.start - position)` — when to fire.
- `bufferOffset = clip.offset + max(0, position - clip.start)` — where in the
  source to begin (supports clips that start before the playhead and trim).
- `playDur = clip.duration - offsetIntoClip`.

Sources connect to their track's gain node, so all mixing/pan/mute/solo applies.
Transport position is derived from the audio clock
(`playStartPos + (ctx.currentTime - playStartCtxTime)`) for drift-free sync, and
read each animation frame to move the playhead.

### Metering

A single `requestAnimationFrame` loop reads every analyser with
`getFloatTimeDomainData`, computes RMS, applies light perceptual scaling, and
pushes one `MeterSnapshot` (master L/R, per-track, input) to the store. One loop
for the whole app keeps it cheap.

## Microphone & recording

1. `openInput(deviceId, gain)` calls `getUserMedia` with
   `echoCancellation/noiseSuppression/autoGainControl: false` (we want the raw
   vocal), creates `MediaStreamSource → inputGain`, then fans out to:
   - `inputAnalyser` (input meter),
   - `monitorGain → master` (monitoring, **off by default** for feedback safety),
   - `MediaStreamDestination` whose stream feeds the `MediaRecorder`.
2. Recording the `MediaStreamDestination` (not the raw device) means the captured
   audio includes the **input gain** the user dialed in.
3. `MediaRecorder` picks the best supported container
   (`audio/webm;codecs=opus`, etc.) and emits chunks.
4. On stop, chunks → `Blob` → `decodeAudioData` → `AudioBuffer`. We register the
   buffer, build a mono mixdown for waveform peaks, persist the blob to
   IndexedDB, and create a clip at the position recording started.
5. **Multiple takes**: each recording is a new asset + clip; take numbers
   increment per track. Overdubbing plays existing clips while recording.

### Monitoring safety

Monitoring is never auto-enabled. The first time the user turns it on, a modal
(`MonitorWarning.tsx`) warns to use headphones; the choice is remembered.

## Waveforms

`src/audio/waveform.ts` keeps a cached mono `Float32Array` per asset and computes
**min/max peaks per pixel column** for the exact visible sample range at the
current zoom, drawn to a `<canvas>` (`Clip.tsx`). Real peaks, any zoom, no
re-decode.

## Suspend / resume

The `AudioContext` is created on the first user gesture and resumed as needed
(browser autoplay policy). `suspend()` is a no-op during playback so the
transport never stalls.

## Offline mixdown / export

`src/audio/export.ts` re-renders the whole project through an
`OfflineAudioContext` (honoring per-track gain/pan/mute/solo + master gain) into
a stereo `AudioBuffer`, then encodes 16-bit PCM **WAV**. This is the basis for
mastering/export in later steps; MP3 export is a planned addition.
