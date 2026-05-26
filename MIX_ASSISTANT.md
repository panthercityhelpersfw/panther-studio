# Mix Assistant

Per-track mix analysis with one-click fixes, plus auto gain-staging and bus routing. Code: `src/audio/mixAssistant.ts`. UI: **MIX ASSIST** tab in the bottom dock (`src/components/MixAssistant.tsx`).

## Analysis

**Analyze mix** renders each track's stem offline (`renderStem`) and measures real peak / RMS / spectral-band ratios / crest factor (`analyzeBuffer`). It then derives issues:

- **Clipping / no headroom** (peak ≥ −0.1 dB)
- **Hot peaks** (peak > −3 dB)
- **Low level** (RMS < −30 dBFS)
- **Muddy / boomy low end** or **low-mid build-up**
- **Harsh / bright highs**
- **Over-compression** (crest < 6 dB at high RMS)

Each issue offers a concrete fix that makes a real change to the track's gain / EQ / limiter (`applyMixFix`): Lower & add limiter, Raise level, Auto level-ride, High-pass + low cut, Cut 300 Hz mud, Tame harsh highs.

## Vocal level rider

`Auto level-ride` (also a coach safe-fix) computes a slow moving-RMS envelope and applies smoothed make-up gain toward a target so quiet and loud passages sit closer together — rendered to a new asset (reversible via A/B).

## Auto gain staging

**Auto gain-stage** renders every track's stem, measures its peak, and sets each track's gain so it peaks near −6 dBFS for consistent headroom.

## Bus routing

Three mix buses ship by default — **Vocals / Music / Drums** (`Project.buses`). Tracks route to a bus from the track header; bus gain/mute are applied in the gain stage for both live playback and the offline renderer (so they affect exports). **Auto-route buses** assigns tracks to buses by name heuristics. Bus faders + mutes live in the MIX ASSIST panel.

## Honest limitations

- Analysis is per-track-stem (post that track's own FX), not full inter-track masking analysis.
- Buses are gain/mute groups computed in the gain stage, not separate DSP insert busses (this keeps routing leak-free and identical between live and export).
