# Effects Engine

Panther Studio's per-track vocal chain is a **real Web Audio graph**. Every knob,
toggle, preset, and meter is bound to an actual `AudioNode` parameter. There are
no cosmetic controls and no simulated processing.

## Where it sits in the signal path

```
clip sources ─▶ track.input ─▶ [EffectChain] ─▶ track.gain(fader) ─▶ pan ─▶ analyser ─▶ master ─▶ out
                                     ▲
            wet monitoring (mic) ────┘   (input -> monitorWet -> armed track's chain input)
```

The chain is inserted at the track **input**, so it affects both clip playback
and (optionally) live monitoring. Recording always taps the **dry** mic signal
(pre-effects), so effects stay non-destructive — you can change them forever.

## Fixed-topology, click-free design

`src/audio/effects/EffectChain.ts` builds the whole chain **once** and never
reconnects nodes. Each effect is a "slot":

```
input ─▶ dry ─────────────▶ output
  └────▶ [process] ─▶ wet ─▶ output
```

- **Insert effects** (gate, EQ, de-esser, compressor, limiter): enabled ⇒
  `wet=1, dry=0`; bypassed ⇒ `wet=0, dry=1`.
- **Blend effects** (saturation, doubler/chorus, delay, reverb): `dry=1` always,
  `wet = mix` when enabled (parallel) — the **wet/dry** control.

Because enabling/bypassing and wet/dry are just gain changes, there is **no node
churn** on parameter edits: no clicks, and **no node leaks** (the graph is
allocated when the track is created and torn down in `dispose()` when the track
is removed). This directly satisfies the stability requirements.

## The effects (canonical vocal order)

Order is fixed to a sensible vocal chain:
`gate → EQ → de-esser → compressor → saturation → doubler → delay → reverb → limiter`.

| Effect | Implementation | Key params |
|--------|----------------|-----------|
| **Noise Gate** | Envelope-follower: `AnalyserNode` detector + `GainNode`, updated each animation frame via `setTargetAtTime` (real level-dependent gating). | threshold, attack, release, floor |
| **EQ** | `BiquadFilterNode` chain: high-pass + low-shelf + peaking mid + high-shelf (air). | HPF, low/mid/high gain+freq, mid Q |
| **De-Esser** | Split-band: low-pass + (high-pass → fast `DynamicsCompressorNode`) recombined — compresses only sibilance. | crossover freq, threshold, ratio |
| **Compressor** | `DynamicsCompressorNode` + makeup `GainNode`. Live gain-reduction metered via `.reduction`. | threshold, ratio, attack, release, knee, makeup |
| **Saturation** | `WaveShaperNode` with a tanh curve (4× oversampling) + drive pre-gain. | drive, mix |
| **Doubler/Chorus** | Two LFO-modulated `DelayNode`s panned L/R (`OscillatorNode → GainNode → delayTime`). | depth, rate, spread, mix |
| **Delay** | `DelayNode` + feedback `GainNode` + low-pass tone filter. | time, feedback, tone, mix |
| **Reverb** | `ConvolverNode` with a **procedurally generated** stereo impulse (decaying filtered noise) + pre-delay. | size, decay, pre-delay, mix |
| **Limiter** | `DynamicsCompressorNode` (20:1, 0 knee, fast attack) as a brick-wall. Gain-reduction metered. | ceiling, release |

## State & persistence

`EffectsState` (`src/audio/effects/types.ts`) is a plain serializable object
stored on each `Track` and saved with the project (IndexedDB). Defaults are
neutral/disabled, so opening an old project changes nothing until effects are
enabled. `normalizeEffects()` deep-merges stored state onto fresh defaults, so
projects saved before this feature load cleanly.

On load, the store calls `audioEngine.applyEffects(trackId, state)` for every
track, which calls `EffectChain.apply()` to push all params into the live graph —
so **effects are restored exactly** on reopen.

## Metering

- **Gain reduction** (compressor + limiter) is read from `DynamicsCompressorNode.reduction`
  each frame and shown on the relevant rack cards and in the GR meters.
- **Spectrum analyzer** reads the master bus `AnalyserNode` FFT (`Analyzer.tsx`).
- Track/master/input level meters are unchanged from Step 1 (real RMS).

## Monitoring with effects

`AudioEngine` supports **dry** and **wet** monitoring:

- *Dry*: mic → `monitorGain` → master (raw, lowest latency).
- *Wet*: mic → `monitorWet` → the armed (or selected) track's chain input, so you
  hear EQ/comp/reverb/etc. while singing.

Monitoring is **off by default** and gated behind the headphone-safety warning.
The wet route automatically follows whichever track is armed.

## Offline export

`renderMixdown()` rebuilds the same `EffectChain` inside an `OfflineAudioContext`,
so the exported WAV includes the effects (EQ, comp, saturation, delay, reverb,
limiter…). The only exception is the envelope-follower gate, which is left open
offline — see `DSP_LIMITATIONS.md`.
