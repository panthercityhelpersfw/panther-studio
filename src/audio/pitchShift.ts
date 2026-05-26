/**
 * Phase-vocoder pitch shifting. This is the standard, robust method:
 *   1. STFT time-stretch by the shift factor (preserves pitch, changes length)
 *      using true-frequency phase propagation.
 *   2. Resample the stretched signal back to the original length, which raises
 *      (or lowers) the pitch by the factor while keeping the duration.
 *
 * Used by the autotune engine and harmony drafts. Mono in / mono out.
 */

const N = 2048; // FFT size (power of two)
const HA = 512; // analysis hop

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

const WIN = hann(N);

/** In-place iterative radix-2 Cooley-Tukey FFT. `inverse` toggles direction. */
function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

const TWO_PI = 2 * Math.PI;
function wrapPhase(p: number): number {
  return p - TWO_PI * Math.round(p / TWO_PI);
}

/** STFT time-stretch by `factor` (>1 = longer), pitch preserved. */
export function timeStretchMono(x: Float32Array, factor: number): Float32Array {
  const Hs = Math.max(1, Math.round(HA * factor));
  const bins = N / 2;
  const outLen = Math.ceil(x.length * factor) + N;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const lastPhase = new Float32Array(bins + 1);
  const sumPhase = new Float32Array(bins + 1);
  const numFrames = Math.floor((x.length - N) / HA);

  for (let f = 0; f <= numFrames; f++) {
    const inOff = f * HA;
    for (let i = 0; i < N; i++) {
      re[i] = (x[inOff + i] || 0) * WIN[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k <= bins; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const phase = Math.atan2(im[k], re[k]);
      const expected = (TWO_PI * HA * k) / N;
      const delta = wrapPhase(phase - lastPhase[k] - expected);
      const trueFreq = expected + delta; // radians advanced per analysis hop
      lastPhase[k] = phase;
      sumPhase[k] += trueFreq * (Hs / HA); // advance by the synthesis hop
      re[k] = mag * Math.cos(sumPhase[k]);
      im[k] = mag * Math.sin(sumPhase[k]);
    }
    // Hermitian mirror for a real IFFT.
    for (let k = 1; k < bins; k++) {
      re[N - k] = re[k];
      im[N - k] = -im[k];
    }
    im[0] = 0;
    im[bins] = 0;
    fft(re, im, true);
    const outOff = f * Hs;
    for (let i = 0; i < N; i++) {
      if (outOff + i < outLen) {
        out[outOff + i] += re[i] * WIN[i];
        norm[outOff + i] += WIN[i] * WIN[i];
      }
    }
  }
  const usable = Math.ceil(x.length * factor);
  for (let i = 0; i < usable; i++) if (norm[i] > 1e-8) out[i] /= norm[i];
  return out.subarray(0, usable);
}

function readLerp(a: Float32Array, pos: number): number {
  const i0 = Math.floor(pos);
  if (i0 < 0 || i0 + 1 >= a.length) return a[Math.max(0, Math.min(a.length - 1, Math.round(pos)))] || 0;
  const frac = pos - i0;
  return a[i0] * (1 - frac) + a[i0 + 1] * frac;
}

/** Pitch-shift a mono signal by ratio `r` (1 = unchanged), duration preserved. */
export function pitchShiftMono(x: Float32Array, r: number): Float32Array {
  if (Math.abs(r - 1) < 0.0005 || x.length < N) return Float32Array.from(x);
  const stretched = timeStretchMono(x, r); // length ~ x.length*r, same pitch
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = readLerp(stretched, i * r);
  return out;
}

/**
 * Time-varying pitch correction. `ratioAt(sample)` returns the desired pitch
 * ratio at each sample. Processed in overlapping windows (constant ratio per
 * window), Hann cross-faded so the ratio can track the melody.
 */
export function pitchCorrectMono(x: Float32Array, ratioAt: (sample: number) => number): Float32Array {
  const len = x.length;
  const W = 8192;
  const hop = W / 2;
  const y = new Float32Array(len);
  const norm = new Float32Array(len);
  const win = hann(W);
  for (let start = 0; start < len; start += hop) {
    const end = Math.min(len, start + W);
    const segLen = end - start;
    if (segLen < N) {
      // Too short to shift — copy dry.
      for (let j = 0; j < segLen; j++) {
        const w = win[j] ?? 0;
        y[start + j] += x[start + j] * w;
        norm[start + j] += w;
      }
      continue;
    }
    const r = ratioAt(start + segLen / 2);
    const shifted = pitchShiftMono(x.slice(start, end), r);
    for (let j = 0; j < segLen; j++) {
      const w = win[j] ?? 0;
      y[start + j] += (shifted[j] || 0) * w;
      norm[start + j] += w;
    }
  }
  for (let i = 0; i < len; i++) {
    if (norm[i] > 1e-6) y[i] /= norm[i];
    else y[i] = x[i];
  }
  return y;
}
