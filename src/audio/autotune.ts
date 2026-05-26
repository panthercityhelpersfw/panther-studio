/**
 * Real, offline pitch correction ("autotune") for a vocal clip.
 *
 * Honest description of the method (no black box):
 *  1. Pitch is detected per analysis frame with normalized autocorrelation
 *     (the same family of algorithm as the live tuner), producing an f0 track.
 *  2. Each voiced frame's pitch is snapped toward the nearest note in the chosen
 *     key/scale. `strength` blends between the original and the snapped pitch;
 *     `retuneSpeed` controls how quickly the correction reacts (slow = gliding,
 *     fast = hard snap); `humanize` adds a small natural drift so it isn't robotic.
 *  3. Correction is applied with a time-varying granular overlap-add pitch
 *     shifter (Hann-windowed grains, 75% overlap, linear-interpolated resampling).
 *     Duration is preserved exactly.
 *
 * Limitations (documented in AUTOTUNE_ENGINE.md):
 *  - Monophonic only (one note at a time) — correct for solo vocals.
 *  - Large shifts introduce some granular artifacts; small corrections (the
 *    common case) sound clean.
 *  - "Formant preserve" is a lightweight spectral-tilt compensation, not a full
 *    phase-vocoder/LPC formant lock. It reduces the "chipmunk" tilt on moderate
 *    shifts but is not transparent at extreme shifts.
 *  - Runs offline (render-to-asset). Real-time correction-while-singing is not
 *    offered because it is not stable on the main thread; the live Tuner shows
 *    pitch in real time instead.
 */
import { pitchShiftMono, pitchCorrectMono, timeStretchMono } from "./pitchShift";

export type ScaleId =
  | "chromatic"
  | "major"
  | "minor"
  | "harmonicMinor"
  | "majorPent"
  | "minorPent"
  | "dorian"
  | "mixolydian";

export const SCALES: Record<ScaleId, { name: string; degrees: number[] }> = {
  chromatic: { name: "Chromatic", degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { name: "Major", degrees: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "Natural Minor", degrees: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: "Harmonic Minor", degrees: [0, 2, 3, 5, 7, 8, 11] },
  majorPent: { name: "Major Pentatonic", degrees: [0, 2, 4, 7, 9] },
  minorPent: { name: "Minor Pentatonic", degrees: [0, 3, 5, 7, 10] },
  dorian: { name: "Dorian", degrees: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { name: "Mixolydian", degrees: [0, 2, 4, 5, 7, 9, 10] },
};

export const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface AutotuneOptions {
  /** Root key 0..11 (0 = C). */
  key: number;
  scale: ScaleId;
  /** 0..1 correction strength (1 = fully snapped). */
  strength: number;
  /** 0..1 retune speed (1 = instant snap, 0 = slow glide). */
  speed: number;
  /** 0..1 humanize (adds small natural pitch drift). */
  humanize: number;
  formantPreserve: boolean;
}

export interface PitchFrame {
  t: number;        // seconds
  freq: number | null;
  midi: number | null;
  targetMidi: number | null;
}

const FRAME = 2048;
const HOP = 512;

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function freqToMidi(f: number) {
  return 69 + 12 * Math.log2(f / 440);
}

/** Snap a midi pitch to the nearest allowed note in key/scale. */
function snapMidi(midi: number, key: number, scale: ScaleId): number {
  const degrees = SCALES[scale].degrees;
  const round = Math.round(midi);
  let best = round;
  let bestDist = Infinity;
  // Search a couple octaves around for the closest scale tone.
  for (let oct = -1; oct <= 1; oct++) {
    const base = Math.floor((round - key) / 12) * 12 + key + oct * 12;
    for (const d of degrees) {
      const cand = base + d;
      const dist = Math.abs(cand - midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return best;
}

/**
 * Pitch detection via the Normalized Square Difference Function (McLeod Pitch
 * Method). Far more robust against octave errors than naive autocorrelation.
 * Returns Hz or null for silent/unvoiced frames.
 */
function detectFramePitch(buf: Float32Array, start: number, fs: number): number | null {
  const W = FRAME;
  let rms = 0;
  for (let i = 0; i < W; i++) {
    const v = buf[start + i] || 0;
    rms += v * v;
  }
  rms = Math.sqrt(rms / W);
  if (rms < 0.008) return null; // silence / unvoiced

  const maxLag = Math.min(Math.floor(fs / 65), Math.floor(W / 2)); // down to ~65 Hz
  const nsdf = new Float32Array(maxLag);
  for (let lag = 0; lag < maxLag; lag++) {
    let acf = 0;
    let m = 0;
    const count = W - lag;
    for (let i = 0; i < count; i++) {
      const a = buf[start + i] || 0;
      const b = buf[start + i + lag] || 0;
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m > 1e-9 ? (2 * acf) / m : 0;
  }

  // Skip the trivial lag~0 peak (until NSDF first dips below zero), then collect
  // the "key maxima" (one local max per positive hump). The fundamental is the
  // FIRST key maximum at/above a clarity threshold of the global max — taking the
  // global max alone causes octave-DOWN errors at period multiples.
  let lag = 1;
  while (lag < maxLag - 1 && nsdf[lag] > 0) lag++;
  const peaks: { lag: number; val: number }[] = [];
  let curMaxLag = -1;
  let curMaxVal = -Infinity;
  let inHump = false;
  for (; lag < maxLag - 1; lag++) {
    if (nsdf[lag] > 0) {
      inHump = true;
      if (nsdf[lag] > curMaxVal) {
        curMaxVal = nsdf[lag];
        curMaxLag = lag;
      }
    } else if (inHump) {
      if (curMaxLag > 0) peaks.push({ lag: curMaxLag, val: curMaxVal });
      inHump = false;
      curMaxVal = -Infinity;
      curMaxLag = -1;
    }
  }
  if (inHump && curMaxLag > 0) peaks.push({ lag: curMaxLag, val: curMaxVal });
  if (peaks.length === 0) return null;
  const globalMax = peaks.reduce((m, p) => Math.max(m, p.val), 0);
  if (globalMax < 0.5) return null;
  const threshold = globalMax * 0.9;
  const chosen = peaks.find((p) => p.val >= threshold) ?? peaks[0];
  const bestLag = chosen.lag;

  // Parabolic interpolation for sub-sample period accuracy.
  const a = nsdf[bestLag - 1];
  const b = nsdf[bestLag];
  const c = nsdf[bestLag + 1];
  const denom = a - 2 * b + c;
  const delta = denom !== 0 ? Math.max(-1, Math.min(1, (0.5 * (a - c)) / denom)) : 0;
  const freq = fs / (bestLag + delta);
  if (freq < 60 || freq > 1200) return null;
  return freq;
}

function mixMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  const ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i] / ch;
  }
  return out;
}

/** Detect the pitch track + per-frame target for visualization. */
export function detectPitchTrack(buffer: AudioBuffer, opts: AutotuneOptions): PitchFrame[] {
  const fs = buffer.sampleRate;
  const mono = mixMono(buffer);
  const frames: PitchFrame[] = [];
  for (let start = 0; start + FRAME <= mono.length; start += HOP) {
    const freq = detectFramePitch(mono, start, fs);
    const midi = freq ? freqToMidi(freq) : null;
    const targetMidi = midi != null ? snapMidi(midi, opts.key, opts.scale) : null;
    frames.push({ t: start / fs, freq, midi, targetMidi });
  }
  return frames;
}

/**
 * Apply pitch correction and return a new AudioBuffer (same duration/channels).
 * Also returns the detected pitch track for display.
 */
export function correctPitch(
  buffer: AudioBuffer,
  opts: AutotuneOptions
): { buffer: AudioBuffer; track: PitchFrame[] } {
  const fs = buffer.sampleRate;
  const len = buffer.length;
  const numCh = buffer.numberOfChannels;

  // 1) Pitch track on the mono mix.
  const track = detectPitchTrack(buffer, opts);

  // 2) Per-frame correction ratio, smoothed by retune speed (+ humanize drift).
  const ratioFrames = new Float32Array(track.length);
  const alpha = 0.05 + opts.speed * 0.9; // smoothing toward the new target
  let smoothed = 1;
  let lastValid = 1;
  for (let i = 0; i < track.length; i++) {
    const f = track[i];
    let target = 1;
    if (f.freq && f.midi != null && f.targetMidi != null) {
      const corrected = f.midi + opts.strength * (f.targetMidi - f.midi);
      target = midiToFreq(corrected) / f.freq;
      lastValid = target;
    } else {
      target = lastValid * 0.5 + 0.5; // relax toward 1 on unvoiced frames
    }
    smoothed += alpha * (target - smoothed);
    // Humanize: subtle slow drift (±~8 cents max) so it isn't robotic.
    const drift = opts.humanize > 0 ? 1 + opts.humanize * 0.005 * Math.sin(i * 0.13) : 1;
    ratioFrames[i] = smoothed * drift;
  }

  const ratioAt = (sample: number): number => {
    const fpos = sample / HOP;
    const i0 = Math.max(0, Math.min(ratioFrames.length - 1, Math.floor(fpos)));
    const i1 = Math.min(ratioFrames.length - 1, i0 + 1);
    const frac = fpos - i0;
    return ratioFrames[i0] * (1 - frac) + ratioFrames[i1] * frac;
  };

  // 3) Apply correction per channel with a time-varying pitch shift (two-stage:
  //    OLA time-stretch then resample). Done in short overlapping windows so the
  //    shift can track the changing correction ratio.
  const out = new OfflineAudioContext(numCh, len, fs).createBuffer(numCh, len, fs);
  for (let c = 0; c < numCh; c++) {
    const x = buffer.getChannelData(c);
    const y = pitchCorrectMono(x, ratioAt);
    out.getChannelData(c).set(y);
    if (opts.formantPreserve) applyTiltComp(out.getChannelData(c), ratioFrames);
  }

  return { buffer: out, track };
}

/** Constant-ratio pitch shift of a whole buffer (used for harmony drafts). */
export function pitchShiftConstant(buffer: AudioBuffer, semitones: number): AudioBuffer {
  const fs = buffer.sampleRate;
  const len = buffer.length;
  const numCh = buffer.numberOfChannels;
  const r = Math.pow(2, semitones / 12);
  const out = new OfflineAudioContext(numCh, len, fs).createBuffer(numCh, len, fs);
  for (let c = 0; c < numCh; c++) {
    out.getChannelData(c).set(pitchShiftMono(buffer.getChannelData(c), r));
  }
  return out;
}

/** Pitch-preserving time stretch of a whole buffer. `factor` > 1 makes it longer. */
export function timeStretchConstant(buffer: AudioBuffer, factor: number): AudioBuffer {
  const fs = buffer.sampleRate;
  const ratio = Math.max(0.35, Math.min(3, factor));
  const len = Math.max(1, Math.round(buffer.length * ratio));
  const numCh = buffer.numberOfChannels;
  const out = new OfflineAudioContext(numCh, len, fs).createBuffer(numCh, len, fs);
  for (let c = 0; c < numCh; c++) {
    const stretched = timeStretchMono(buffer.getChannelData(c), ratio);
    out.getChannelData(c).set(stretched.subarray(0, len));
  }
  return out;
}

/** Crude formant compensation: counter the average brightness shift from the
 *  pitch change with a gentle one-pole tilt. Approximate, not a true formant lock. */
function applyTiltComp(y: Float32Array, ratioFrames: Float32Array) {
  let avg = 0;
  for (let i = 0; i < ratioFrames.length; i++) avg += ratioFrames[i];
  avg /= Math.max(1, ratioFrames.length);
  const shiftCents = 1200 * Math.log2(avg || 1);
  if (Math.abs(shiftCents) < 20) return;
  // Upward shift brightens → apply mild low-pass tilt; downward → mild high-pass.
  const k = Math.max(-0.15, Math.min(0.15, shiftCents / 1200));
  let lp = 0;
  for (let i = 0; i < y.length; i++) {
    lp += 0.2 * (y[i] - lp);
    // Blend toward low-passed (k>0) or toward the difference (k<0).
    y[i] = y[i] + k * (lp - y[i]);
  }
}
