# Audio Analysis Pipeline

The pipeline is offline/background-friendly and avoids the recording monitor path.

1. Pull project metadata from Zustand state.
2. Read decoded buffers through `audioEngine.getBuffer`.
3. Analyze clips directly for pitch, timing, spectral balance, stereo image, phrase consistency, and vocal energy.
4. Render stems with `renderStem` through the existing export engine for mix measurements.
5. Render a master mixdown with `renderMixdown` for export readiness.
6. Build scores and recommendations.
7. Save the snapshot to `project.studioIntelligence`.

No analyzer blocks live input monitoring. The engine is invoked by user action from the Intelligence panel, and destructive processing still runs through existing undoable project mutations.

## Measurement Notes

- Pitch tracking uses the existing autocorrelation path from `src/audio/autotune.ts`.
- Loudness is a real RMS-derived approximation, not a certified LUFS meter.
- Spectral analysis uses deterministic band-energy ratios.
- Timing uses onset energy changes against tempo-grid subdivisions.
- Stereo analysis uses L/R correlation and side/mid ratio.
- Masking risk is derived from rendered stem level relationships and track role.
