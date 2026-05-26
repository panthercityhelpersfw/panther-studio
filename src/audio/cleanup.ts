/**
 * Offline vocal cleanup. Produces a new, cleaned AudioBuffer. Every stage is
 * real signal processing:
 *
 *  - De-click: detects isolated sample spikes (clicks/pops) and interpolates.
 *  - Noise reduction: downward expansion below an estimated noise floor.
 *  - Noise gate: hard attenuation of sections below a threshold (smoothed).
 *  - Breath reduction: attenuates short, low-level, HF-dominant segments.
 *  - Tonal cleanup (de-ess / harshness / mud / resonance): rendered through a
 *    real Web Audio biquad + split-band de-esser chain in an OfflineAudioContext.
 *
 * Limitations (VOCAL_CLEANUP.md): noise reduction is energy-based downward
 * expansion, not full spectral subtraction, so very steady broadband noise is
 * reduced rather than fully removed. De-click handles isolated transients, not
 * sustained crackle.
 */

export interface CleanOptions {
  /** 0..1 amount of downward expansion below the noise floor. */
  noiseReduction: number;
  /** Hard gate the quietest sections. */
  gate: boolean;
  /** 0..1 breath attenuation. */
  breath: number;
  /** Remove isolated clicks/pops. */
  declick: boolean;
  /** 0..1 de-esser amount. */
  deEss: number;
  /** 0..1 harshness (2–5 kHz) reduction. */
  harshness: number;
  /** 0..1 mud (200–500 Hz) reduction. */
  mud: number;
  /** 0..1 narrow-resonance taming. */
  resonance: number;
}

function frameRms(x: Float32Array, i: number, win: number): number {
  let sum = 0;
  const half = win >> 1;
  const a = Math.max(0, i - half);
  const b = Math.min(x.length, i + half);
  for (let j = a; j < b; j++) sum += x[j] * x[j];
  return Math.sqrt(sum / Math.max(1, b - a));
}

/** Estimate the noise floor as a low percentile of frame energies. */
function estimateNoiseFloor(x: Float32Array, fs: number): number {
  const hop = Math.floor(fs * 0.02);
  const win = hop * 2;
  const rmsVals: number[] = [];
  for (let i = 0; i < x.length; i += hop) rmsVals.push(frameRms(x, i, win));
  rmsVals.sort((a, b) => a - b);
  const p = rmsVals[Math.floor(rmsVals.length * 0.1)] || 0;
  return Math.max(1e-5, p);
}

/** Remove isolated sample spikes (clicks). */
function declick(x: Float32Array): void {
  const n = x.length;
  for (let i = 2; i < n - 2; i++) {
    const local = (Math.abs(x[i - 2]) + Math.abs(x[i - 1]) + Math.abs(x[i + 1]) + Math.abs(x[i + 2])) / 4;
    const d = Math.abs(x[i] - (x[i - 1] + x[i + 1]) / 2);
    // A spike is much larger than its neighbours and the local average.
    if (d > 0.15 && Math.abs(x[i]) > local * 4 + 0.05) {
      x[i] = (x[i - 1] + x[i + 1]) / 2;
    }
  }
}

/** Precompute a smoothed RMS envelope at every sample (hop-based + interpolated). */
function envelope(x: Float32Array, fs: number): Float32Array {
  const hop = Math.max(1, Math.floor(fs * 0.005));
  const win = hop * 4;
  const env = new Float32Array(x.length);
  let lastIdx = 0;
  let lastVal = 0;
  for (let i = 0; i < x.length; i += hop) {
    const v = frameRms(x, i, win);
    // Linear-interpolate between hop points.
    for (let j = lastIdx; j < i && j < x.length; j++) {
      const f = (j - lastIdx) / Math.max(1, i - lastIdx);
      env[j] = lastVal * (1 - f) + v * f;
    }
    lastIdx = i;
    lastVal = v;
  }
  for (let j = lastIdx; j < x.length; j++) env[j] = lastVal;
  return env;
}

/** Energy-based downward expansion + optional gate + breath attenuation. */
function denoise(x: Float32Array, fs: number, opts: CleanOptions): void {
  const floor = estimateNoiseFloor(x, fs);
  const gateThresh = floor * 3.0;
  const expandKnee = floor * 6.0;
  const env = envelope(x, fs);
  const breathLP = lowpass(x, 2000, fs); // low band for HF-ratio detection
  let g = 1;
  const atkCoef = Math.exp(-1 / (fs * 0.005));
  const relCoef = Math.exp(-1 / (fs * 0.06));
  for (let i = 0; i < x.length; i++) {
    const e = env[i];
    let targetGain = 1;
    // Downward expansion below the knee.
    if (opts.noiseReduction > 0 && e < expandKnee) {
      const ratio = Math.max(0, (e - floor) / (expandKnee - floor));
      targetGain = 1 - opts.noiseReduction * (1 - ratio);
    }
    // Hard gate.
    if (opts.gate && e < gateThresh) {
      targetGain = Math.min(targetGain, 0.05);
    }
    // Breath: low-ish energy with strong HF content (sample dominated by highs).
    if (opts.breath > 0 && e > floor && e < expandKnee * 1.5) {
      const hf = Math.abs(x[i] - (breathLP[i] || 0));
      const total = Math.abs(x[i]) + 1e-6;
      if (hf / total > 0.6) targetGain = Math.min(targetGain, 1 - opts.breath * 0.85);
    }
    const coef = targetGain < g ? atkCoef : relCoef;
    g = targetGain + (g - targetGain) * coef;
    x[i] *= g;
  }
}

/** Simple one-pole low-pass returning a new array. */
function lowpass(x: Float32Array, fc: number, fs: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / fs);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
}

export async function cleanVocal(buffer: AudioBuffer, opts: CleanOptions): Promise<AudioBuffer> {
  const fs = buffer.sampleRate;
  const len = buffer.length;
  const numCh = buffer.numberOfChannels;

  // 1) Sample-domain stages per channel into a working buffer.
  const work = new OfflineAudioContext(numCh, len, fs).createBuffer(numCh, len, fs);
  for (let c = 0; c < numCh; c++) {
    const x = Float32Array.from(buffer.getChannelData(c));
    if (opts.declick) declick(x);
    if (opts.noiseReduction > 0 || opts.gate || opts.breath > 0) denoise(x, fs, opts);
    work.getChannelData(c).set(x);
  }

  // 2) Tonal cleanup via a real biquad + de-esser chain (offline render).
  const octx = new OfflineAudioContext(numCh, len, fs);
  const src = octx.createBufferSource();
  src.buffer = work;
  let node: AudioNode = src;

  if (opts.mud > 0) {
    const f = octx.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = 320;
    f.Q.value = 1.0;
    f.gain.value = -6 * opts.mud;
    node.connect(f);
    node = f;
  }
  if (opts.harshness > 0) {
    const f = octx.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = 3400;
    f.Q.value = 1.2;
    f.gain.value = -6 * opts.harshness;
    node.connect(f);
    node = f;
  }
  if (opts.resonance > 0) {
    const f = octx.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = 1000;
    f.Q.value = 2.5;
    f.gain.value = -4 * opts.resonance;
    node.connect(f);
    node = f;
  }
  if (opts.deEss > 0) {
    // Split-band de-esser: compress only the sibilance band, then sum.
    const split = octx.createBiquadFilter();
    split.type = "highpass";
    split.frequency.value = 6000;
    const comp = octx.createDynamicsCompressor();
    comp.threshold.value = -34 + (1 - opts.deEss) * 12;
    comp.ratio.value = 3 + opts.deEss * 5;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;
    comp.knee.value = 2;
    const lowSide = octx.createBiquadFilter();
    lowSide.type = "lowpass";
    lowSide.frequency.value = 6000;
    const sum = octx.createGain();
    node.connect(lowSide).connect(sum);
    node.connect(split).connect(comp).connect(sum);
    node = sum;
  }

  node.connect(octx.destination);
  src.start();
  return octx.startRendering();
}
