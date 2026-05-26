/**
 * Loudness analysis for a rendered mix. Peak, RMS, and clipping are exact. The
 * LUFS figure is an APPROXIMATION: a K-weighted (BS.1770-style) filter is
 * applied and the ungated mean-square is converted with the -0.691 offset. It is
 * labeled everywhere as "approx LUFS" and must not be treated as a certified
 * loudness measurement. Coefficients are the standard 48 kHz K-weighting biquads;
 * at other sample rates the estimate drifts slightly.
 */

export type LoudnessSeverity = "ok" | "warn" | "bad";

export interface LoudnessWarning {
  severity: LoudnessSeverity;
  text: string;
}

export interface LoudnessResult {
  peak: number;
  peakDb: number;
  rms: number;
  rmsDb: number;
  lufsApprox: number;
  clippedPct: number;
  warnings: LoudnessWarning[];
}

// Direct-form-I biquad applied in place-ish, returning a new array.
function biquad(
  x: Float32Array,
  b0: number,
  b1: number,
  b2: number,
  a1: number,
  a2: number
): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = xn;
    y2 = y1;
    y1 = yn;
    y[i] = yn;
  }
  return y;
}

function kWeight(ch: Float32Array): Float32Array {
  // Stage 1: high-shelf. Stage 2: high-pass. (BS.1770 @ 48 kHz)
  const s1 = biquad(ch, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585);
  return biquad(s1, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
}

const toDb = (x: number) => (x <= 1e-7 ? -120 : 20 * Math.log10(x));

export function analyzeLoudness(buffer: AudioBuffer): LoudnessResult {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;

  // Peak, clipping, RMS over all channels.
  let peak = 0;
  let clipped = 0;
  let sumSq = 0;
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sumSq += d[i] * d[i];
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, len * ch));

  // Approx LUFS: sum of K-weighted channel mean-squares.
  let zSum = 0;
  for (let c = 0; c < ch; c++) {
    const kw = kWeight(buffer.getChannelData(c));
    let ms = 0;
    for (let i = 0; i < len; i++) ms += kw[i] * kw[i];
    zSum += ms / Math.max(1, len);
  }
  const lufsApprox = zSum > 1e-9 ? -0.691 + 10 * Math.log10(zSum) : -70;
  const clippedPct = (clipped / Math.max(1, len * ch)) * 100;

  const warnings: LoudnessWarning[] = [];
  if (clippedPct > 0.01) {
    warnings.push({ severity: "bad", text: `Clipping detected (${clippedPct.toFixed(2)}% of samples at full scale).` });
  }
  if (peak >= 0.999) {
    warnings.push({ severity: "bad", text: "True peak at or over 0 dBFS — reduce output or add limiting." });
  } else if (peak > 0.95) {
    warnings.push({ severity: "warn", text: `Peaks are hot (${toDb(peak).toFixed(1)} dBFS).` });
  }
  if (lufsApprox > -8) {
    warnings.push({ severity: "bad", text: `Very loud (~${lufsApprox.toFixed(1)} LUFS). Streaming services will turn this down and it may distort.` });
  } else if (lufsApprox > -12) {
    warnings.push({ severity: "warn", text: `Loud (~${lufsApprox.toFixed(1)} LUFS). Fine for a demo; above streaming targets (~-14).` });
  } else if (lufsApprox < -20 && lufsApprox > -65) {
    warnings.push({ severity: "warn", text: `Quiet (~${lufsApprox.toFixed(1)} LUFS). Consider raising output or using Auto Master.` });
  }
  if (warnings.length === 0) {
    warnings.push({ severity: "ok", text: `Looks good (~${lufsApprox.toFixed(1)} LUFS, peak ${toDb(peak).toFixed(1)} dBFS).` });
  }

  return {
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    lufsApprox,
    clippedPct,
    warnings,
  };
}
