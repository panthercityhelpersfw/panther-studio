# Vocal Cleanup

Offline vocal cleanup that renders a new, cleaned asset. Code: `src/audio/cleanup.ts`. UI: **VOCAL LAB** tab → CLEANUP section.

## Stages (all real DSP)

- **De-click / de-pop** — detects isolated sample spikes (much larger than neighbours and the local average) and interpolates across them.
- **Noise reduction** — downward expansion below an estimated noise floor (10th-percentile of frame RMS), with attack/release smoothing.
- **Noise gate** — optional hard attenuation of sections below a threshold.
- **Breath reduction** — attenuates short, low-level, high-frequency-dominant segments (breaths) without ducking sung notes.
- **De-esser** — split-band compression of the sibilance band (>6 kHz) via a real `DynamicsCompressorNode`.
- **Harshness reducer** — peaking cut around 3.4 kHz.
- **Mud cleanup** — peaking cut around 320 Hz.
- **Resonance taming** — narrow peaking cut around 1 kHz.

Sample-domain stages (de-click, noise/gate/breath) run first; the tonal stages run through a real Web Audio biquad + de-esser chain in an `OfflineAudioContext`.

## One-click "Clean Vocal Take"

Applies a balanced preset of all stages in one click. **Apply custom** uses the sliders. Both render a new asset and keep the original for **A/B before/after** (`dryAssetId`), so cleanup is reversible.

## Honest limitations

- Noise reduction is energy-based downward expansion, not full FFT spectral subtraction, so very steady broadband hiss is reduced rather than completely removed.
- De-click handles isolated transients, not sustained crackle/distortion.
- Cleanup is destructive-to-a-new-asset (non-destructive to the original); toggling A/B restores the dry take.
