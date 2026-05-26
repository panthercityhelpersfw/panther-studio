# Mastering System

The master bus applies a real processing chain to the summed mix before it
reaches the speakers and the export renderer. It reuses the same `EffectChain`
used per-track, with only the mastering-relevant stages engaged.

## Signal flow

```
all tracks + pads + dry monitor
        │
        ▼
   master SUM ──► masterDry ───────────────► masterOut (output gain) ──► speakers
        └──────► master EffectChain ─► masterWet ─┘                  └─► L/R meters (post-chain)
```

- **Bypass** is a dry/wet switch at the master: bypassed routes the sum straight
  to output; active routes through the chain. (Click-free; the chain always
  exists, no node churn.)
- **Output gain** is `masterOut.gain` (the master fader / "Out" knob).
- Meters and the spectrum analyzer read **post-chain**, so they show true output.

## Master chain stages (real Web Audio)

Engaged on the master (others stay off):

| Stage | Node(s) | Purpose |
|-------|---------|---------|
| **EQ** | high-pass + low/mid/high biquads | Sub clean-up, tonal polish, air |
| **Glue Compressor** | `DynamicsCompressorNode` + makeup | Bind the mix; GR metered |
| **Saturation / soft clip** | `WaveShaperNode` (tanh, oversampled) | Density / warmth |
| **Limiter** | `DynamicsCompressorNode` (20:1, fast, 0 knee) | Brick-wall ceiling; GR metered |

Controls live in the **MASTER** dock tab: bypass, preset, Auto Master, output
gain, and a knob card per stage (with GR meters on the compressor and limiter).

## Master presets

`src/audio/masterPresets.ts` — each sets a real chain + output gain:

- **Streaming Safe** — transparent glue + true-peak-safe limiting.
- **Loud Rap Demo** — aggressive glue, saturation, hard limiting, +output.
- **Clean Vocal Mix** — light air + gentle peak control.
- **Podcast Master** — speech-leveling compression + safe ceiling.
- **Warm Emotional Vocal** — low warmth, soft saturation, musical limiting.

## Auto Master

`src/audio/autoMaster.ts`. Steps:

1. Render the **raw mix** offline (master bypassed) and run loudness analysis
   (see `LOUDNESS_SYSTEM.md`).
2. Compute an output-gain move toward a target loudness (Streaming -14 LUFS or
   Loud -9 LUFS), clamped to ±12 dB.
3. Build a chain: EQ polish, gentle glue compression (2:1), light saturation if
   the mix is quiet, and a true-peak-safe limiter (tighter for "Loud").
4. Apply it and show a **report**: what was measured and exactly what changed.

Auto Master is deterministic and conservative; re-run **Analyze Loudness** after
applying to see the achieved result.

## Reference A/B

Import a finished reference track in the MASTER tab. Toggle **A · Mix** / **B ·
Ref** during playback: the reference plays **straight to the output, bypassing
the master chain**, while the mix is muted, for an honest comparison. Reference
volume is adjustable and the reference bypasses all processing by design. The
reference audio is saved with the project.

## Persistence & export

The master chain (`project.master.effects`), bypass, preset name, and output
gain are saved with the project and re-applied on load. The **export** renderer
runs the same master chain offline, so exported files match what you hear (see
`EXPORT_PIPELINE.md`).
