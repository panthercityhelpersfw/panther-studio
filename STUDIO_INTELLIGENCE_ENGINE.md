# Studio Intelligence Engine

Panther Studio now has a project-level intelligence layer in `src/audio/studioIntelligence.ts`.

The engine is deterministic and measurement-backed. It reads decoded `AudioBuffer` data, rendered stems, project clips, MIDI density, markers, track routing, master settings, and local user memory. It does not generate random advice or synthetic confidence labels.

## Runtime Surface

- UI: `src/components/StudioIntelligencePanel.tsx`
- Store actions: `analyzeStudioIntelligence`, `applyStudioRecommendation`, `rejectStudioRecommendation`, `applyFactoryFxPreset`
- Persistence: `project.studioIntelligence.current`, `history`, and `memory`
- Factory FX: `STUDIO_FACTORY_PRESETS`

## Analyzer Families

- Pitch: autocorrelation pitch frames, cents error, drift, vibrato approximation, key histogram.
- Timing: onset detection, grid deviation, transient density.
- Loudness: peak, RMS, loudness approximation, crest factor, clipping percentage.
- Spectral: low/mid/high energy ratios, mud, harshness, dullness, sibilance, nasal/thin approximations.
- Stereo: L/R correlation, side/mid width, mono risk.
- Mix: per-track stem rendering, headroom, masking risk, kick/bass overlap.
- Arrangement: section energy, vocal density, MIDI density, hook/verse role inference.
- Performance: live effect slots, decoded assets, frozen tracks, complexity risk.

## Scoring

Scores are derived from measured metrics:

- `pitchAccuracy`
- `timingTightness`
- `vocalConsistency`
- `vocalIntelligibility`
- `mixClarity`
- `tonalBalance`
- `dynamicControl`
- `stereoBalance`
- `masterReadiness`
- `arrangementFlow`
- `hookEnergy`
- `vocalPresence`
- `beatVocalCompatibility`
- `exportReadiness`
- `overall`

## Recommendations

Each recommendation stores:

- severity
- confidence derived from evidence count and metric strength
- impact
- urgency
- safe-to-auto-fix flag
- approval requirement
- exact evidence rows
- optional action payload

Accepted and rejected recommendations update local memory so future suggestions reflect user choices.
