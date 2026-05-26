# DSP Limitations & Honest Notes

Everything in the effects engine is real Web Audio DSP. This document is candid
about where approximations are used and what is intentionally out of scope, so
nothing is oversold.

## Approximations (real, but not lab-grade)

- **Noise gate** is an **envelope-follower** gate: an `AnalyserNode` measures the
  signal level and a `GainNode` opens/closes via `setTargetAtTime`. The detector
  updates once per animation frame (~60 Hz), so attack/release resolution is
  coarser than a true per-sample gate. It genuinely gates on real signal level —
  it is not faked — but very fast transients can slip a few ms. A sample-accurate
  `AudioWorklet` gate is a possible future upgrade.
- **De-esser** is a **split-band compressor** (low-pass + high-pass crossover,
  with the high band compressed), not a true dynamic EQ. It really does reduce
  sibilance, but the band split is gentle (one-pole-ish biquads), so extreme
  settings can slightly affect non-sibilant highs.
- **Saturation** uses a static `WaveShaper` tanh curve with 4× oversampling. It's
  real waveshaping/harmonic generation, but not a modeled analog circuit.
- **Reverb** is real convolution, but the impulse response is **synthesised**
  (decaying filtered noise), not sampled from a real space. Size/decay shape the
  IR; it won't sound like a specific famous hall.
- **Loudness estimate** in Auto Enhance is an **RMS-based approximation**, not a
  true integrated **LUFS** (ITU-R BS.1770) measurement. Good enough to decide
  "quiet vs. hot"; not a compliance meter.
- **Level meters** are RMS with light perceptual scaling, not calibrated dBFS
  true-peak meters. The **gain-reduction** meters read the real
  `DynamicsCompressorNode.reduction` value.

## Web Audio platform constraints

- **`DynamicsCompressorNode` has no sidechain input**, which is why the de-esser
  is built from a band split rather than a sidechained compressor.
- **Compressor attack/release/curve** are the browser's built-in implementation;
  exact behavior is fixed by the WebView (Chromium) engine.
- **Latency** depends on the OS/driver and the WebView audio path; no ASIO /
  low-latency driver selection is exposed. Wet monitoring adds the chain's
  processing latency on top of the system round-trip.
- **AudioContext requires a user gesture** to start; the first interaction
  (e.g. pressing Record/Play) resumes it.

## Offline export

- `renderMixdown()` rebuilds the chain in an `OfflineAudioContext`, so EQ,
  compressor, de-esser, saturation, doubler, delay, reverb, and limiter **are**
  rendered into the exported WAV.
- The **envelope-follower gate is left open during offline export** (its detector
  loop is real-time only). If you rely on the gate, it applies during playback
  and monitoring but not in the rendered file. A future offline gate pass can
  close this gap.
- Export is **WAV only** for now. MP3 export needs an encoder and is planned for
  the mastering step.

## Not yet implemented (later steps)

- Master-bus effects / mastering chain (the per-track chain exists; a dedicated
  master chain does not yet).
- Automation of effect parameters over time.
- Per-effect reordering (order is fixed to the canonical vocal chain).
- Spectrum analyzer is master-bus only (no per-track analyzer view).

## What is guaranteed

- Every UI control changes a real audio parameter you can hear.
- Presets, Auto Enhance, and all knob values are saved with the project and
  restored exactly on reopen.
- Enabling/bypassing/editing effects never reconnects nodes, so there are no
  clicks and no audio-node leaks. Removing a track disposes its chain.
- The desktop build is unaffected: effects are pure front-end Web Audio.
