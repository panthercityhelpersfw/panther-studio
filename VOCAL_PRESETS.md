# Vocal Presets

Presets live in `src/audio/presets.ts`. Each one returns a **complete**
`EffectsState`, so applying it configures the real Web Audio chain — nothing is
cosmetic. Pick one from the **Preset…** dropdown in the FX Rack (or the
Inspector). Applying a preset records its name on the track (`presetName`) and is
saved with the project.

| Preset | Character | Engaged effects (highlights) |
|--------|-----------|------------------------------|
| **Clean Pop Vocal** | Bright, controlled, radio-ready | EQ (HPF 90, +1.5 @ 3k, +3 air), De-Esser, Comp 3:1 +3 makeup, light Saturation, short Reverb, Limiter |
| **Rap Vocal** | Upfront, punchy, present | Gate, EQ (HPF 100, presence), De-Esser 5:1, Comp 5:1 fast +5, Saturation, slap Delay, Limiter |
| **Emotional Singing** | Intimate, lush, wide | EQ (low warmth, scooped 900, air), soft Comp 2.5:1, De-Esser, Saturation, Doubler, long Delay + Reverb, Limiter |
| **Warm Podcast** | Spoken-word clarity, body | Gate, EQ (low-shelf warmth, dipped 500), De-Esser, broadcast Comp 3.5:1 +4, Saturation, Limiter (no time FX) |
| **Deep Voice** | Big, authoritative | EQ (HPF 60, +4 low, −2.5 @ 1.5k, tamed highs), Comp 3:1, De-Esser, heavier Saturation, Limiter |
| **Bright Airy Vocal** | Sparkly, open top | EQ (+5 air @ 13k, presence), strong De-Esser 6:1, Comp 3:1, light Saturation, Doubler, shimmer Reverb, Limiter |
| **Raw Studio Monitor** | Minimal, for tracking | EQ (HPF only), gentle Comp 2:1, brick-wall Limiter — nothing else |

## How they're tuned

Each preset starts from `defaultEffects()` (neutral) and overrides only the
parameters that matter for that sound, then flips on the relevant effects. This
keeps them transparent and easy to tweak: after applying a preset you can adjust
any knob in the rack and the change is live and saved.

## Relationship to Auto Enhance

The **Auto Make Vocals Sound Good** button is *not* a fixed preset — it analyzes
the actual selected clip (peak/RMS/loudness/clipping/tonal balance) and derives a
tailored chain plus a gain correction, then shows you exactly what it changed.
See `EFFECTS_ENGINE.md` and the in-app report. Auto Enhance sets the track's
`presetName` to "Auto Enhance".

## Adding your own

Add an entry to the `PRESETS` array in `src/audio/presets.ts`:

```ts
{
  id: "my-preset",
  name: "My Preset",
  description: "What it does.",
  build: () => {
    const e = defaultEffects();
    e.compressor = { ...e.compressor, enabled: true, ratio: 4, makeup: 4 };
    // ...enable/tune whatever you like
    return e;
  },
}
```

It appears in the dropdown automatically.
