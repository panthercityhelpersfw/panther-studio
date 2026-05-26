# Mixer System

The mixer is a real-time view of the live audio graph. Every fader, pan, mute,
solo, and arm control writes directly to Web Audio nodes — moving a fader changes
what you hear immediately.

## Channel strips (one per track)

Each strip (`Mixer.tsx` → `ChannelStrip`) shows and controls:

- **Name + color** (matches the arrangement track).
- **Insert visibility** — a row of abbreviations (EQ, CP, ST, RV, LM…) for the
  effects currently enabled on that track's chain, so you can see processing at a
  glance. (Full editing lives in the FX RACK tab.)
- **Pan** — `StereoPannerNode.pan`.
- **Volume fader** — the track's `GainNode`, with a live RMS **meter** beside it.
- **Arm / Mute / Solo** — `R` / `M` / `S`. Mute and solo are computed into an
  *effective gain* written to the track gain node, so solo on one track silences
  the rest sample-accurately, during playback.

## Track routing

Signal flow per track:

```
clips/MIDI -> track.input -> [EffectChain inserts] -> fader gain -> pan -> analyser -> master sum
```

All tracks (plus the sample-pad bus and dry monitor) route into the **master sum
bus**. There is a single bus topology; per-track "routing" today means level/pan
into the master. (Sub-group buses are a candidate for a later step.)

## Master channel

The master strip shows:

- **Insert visibility** for the master chain (or `BYPASS` when the chain is off).
- **Output fader** (`masterGain` → the master output gain node) with a **stereo
  L/R meter** read *post-master-chain* (true output level).
- A **gain-reduction meter** reflecting the master compressor/limiter.

Full master controls (EQ, glue compressor, saturation, limiter, presets, Auto
Master, loudness, export, reference) live in the **MASTER** dock tab — see
`MASTERING_SYSTEM.md`.

## Meters

A single `requestAnimationFrame` loop in the engine reads every track analyser,
the master L/R analysers (post-chain), the input analyser, and the compressor/
limiter `.reduction` values (per-track and master), and pushes one snapshot to
the store each frame. Meters are real RMS with light perceptual scaling; gain
reduction is the real `DynamicsCompressorNode.reduction` value.

## Persistence

All mix settings (per-track gain/pan/mute/solo/arm/color, effects, and the
master chain + output gain) are part of the project and saved/restored with it.
Verified: applying a master chain, saving, and reopening preserves it exactly.
