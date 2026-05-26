# Audio Engine Breakdown

A deep dive into `src/audio/AudioEngine.ts` and the surrounding audio code. All
processing is real Web Audio — no simulation.

## The graph

```
                                 ┌──────────── per track ────────────┐
 clip BufferSource ─► clipGain ─►│ track.input ─► EffectChain ─► gain │─► panner ─► analyser ─┐
 MIDI synth voice ───────────────►│  (fades)        (inserts)  (fader) │                       │
                                 └────────────────────────────────────┘                       ▼
 mic ─► inputGain ─┬─► inputAnalyser (meter + tuner)                                      master SUM
                   ├─► monitorGain ───────────────────────────────────────────────────────►│ (dry monitor)
                   ├─► monitorWet ─► (armed track.input)  [wet monitor]                      │
                   └─► recDest ─► MediaRecorder (records the dry, gain-applied signal)        │
 sample pad ─► padBus ───────────────────────────────────────────────────────────────────►│
                                                                                            ▼
 reference ─► refGain ─► destination (A/B, bypasses master)        master SUM ─► [masterDry|masterChain►masterWet] ─► masterOut ─► destination
                                                                                                              └─► splitter ─► L/R analysers (post-chain meters)
```

## Master bus

- `master` = summing node (unity). Tracks, pads, and dry monitor connect here.
- `masterChain` = a reused `EffectChain` (EQ/comp/saturation/limiter engaged).
- Bypass = a dry/wet pair (`masterDry`/`masterWet`) — click-free, no node churn.
- `masterOut` = output gain → destination + the L/R analysers, so meters and the
  spectrum show **post-mastering** output (true levels).

## Per-track channel

`track.input → EffectChain → gain (fader) → stereoPanner → analyser → master`.
Mute/solo are folded into an **effective gain** written to the fader, so they are
sample-accurate and work during playback. Effects are non-destructive.

## EffectChain (`effects/EffectChain.ts`)

Fixed order: gate → EQ → de-esser → compressor → saturation → doubler → delay →
reverb → limiter. Each slot is `input → dry → output` and
`input → [process] → wet → output`; enable/bypass and wet/dry are just gain
changes (no reconnects → no clicks, no leaks). Nodes used: `BiquadFilter`
(EQ/HPF/de-ess split, delay tone), `DynamicsCompressor` (comp/de-ess/limiter),
`WaveShaper` (tanh saturation, 4× oversample), `DelayNode` + feedback (delay),
`ConvolverNode` + generated impulse (reverb), LFO-modulated `DelayNode`s
(doubler). The noise gate is an envelope follower driven each animation frame.

## Recording

`getUserMedia` (echo/noise/AGC off for raw vocals) → `inputGain` →
`MediaStreamAudioDestinationNode` → `MediaRecorder` (Opus/WebM where supported).
On stop: chunks → Blob → `decodeAudioData` → `AudioBuffer` → asset + clip + saved
blob. Recording taps the **dry** signal; monitoring effects are not baked in.
Count-in plays clicks before recording starts.

## Playback scheduling

`play(position)` schedules each clip/region: `AudioBufferSourceNode.start(when,
offset, duration)` with a per-clip `GainNode` carrying clip gain + fade ramps.
MIDI clips schedule synth voices (saw + lowpass + AD envelope, velocity-scaled)
into the track input. Transport position is derived from the audio clock
(`playStartPos + (ctx.currentTime - playStartCtxTime)`) for drift-free sync.

## Loop, metronome, count-in

The single rAF meter loop also: advances the transport, fires the loop callback
at loop end (store reseeks + replays), and runs a lookahead metronome click
scheduler. `countIn(bars)` schedules clicks and resolves when done. Clicks route
direct to output (heard, not recorded/exported).

## Metering & analysis

Per frame: per-track RMS, master L/R RMS (post-chain), input RMS, and compressor/
limiter gain reduction (track + master) → one `MeterSnapshot` to the store. The
spectrum analyzer reads the master FFT. The **tuner** runs autocorrelation on the
mic time-domain data. Loudness analysis (`loudness.ts`) renders the mix offline
and computes peak/RMS/clipping + an approximate K-weighted LUFS.

## Monitoring safety

Monitoring is off by default and gated behind a headphone warning. Dry monitor →
master; Wet monitor → the armed track's input (so you hear the chain). The wet
route follows whichever track is armed.

## Export (`export.ts`)

`renderProject` rebuilds the whole graph in an `OfflineAudioContext` — track
chains + master chain + output gain — honoring clip gain/fades/mute and a time
region. Full song, loop region, and per-track stems (pre-master). Output is
16-bit PCM WAV; samples are clamped on encode and the master limiter prevents
overs.

## Reliability

- Suspend/resume handled (context created on first gesture; never suspends during
  playback).
- Mic device loss detected (`MediaStreamTrack.onended`) → input closed, monitor
  off, banner shown.
- Node lifecycle: clip/synth/pad/reference voices stop + disconnect on end;
  effect chains disposed when a track is removed; oscillators stopped.
- Low-CPU mode throttles meter/gate work ~3× (metronome stays accurate).

## Honest approximations

Envelope-follower gate (frame-rate detector), split-band de-esser, synthesized
reverb IR, RMS-based perceptual meters, and approximate (ungated) K-weighted
LUFS. MIDI is real-time only (not yet in offline export). See
`KNOWN_LIMITATIONS.md` and `DSP_LIMITATIONS.md`.
