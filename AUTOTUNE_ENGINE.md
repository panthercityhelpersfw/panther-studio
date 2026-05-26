# Autotune Engine

The existing pitch engine in `src/audio/autotune.ts` is integrated into Studio Intelligence.

## Capabilities

- pitch lane analysis
- key/scale-aware snapping
- retune speed
- strength control
- humanize
- lightweight formant compensation
- offline render mode
- before/after asset preservation

## Intelligence Integration

Studio Intelligence recommends tuning only when pitch evidence supports it:

- voiced pitch frames exist
- average cents error exceeds threshold
- drift is measurable

The action hands off to `applyAutotune`, preserving the dry asset for A/B and undo-style recovery.
