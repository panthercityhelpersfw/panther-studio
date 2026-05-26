import { defaultEffects, type EffectsState } from "./effects/types";

export interface ClipAnalysis {
  peak: number; // 0..1 linear
  peakDb: number;
  rms: number; // 0..1 linear
  rmsDb: number;
  loudnessDb: number; // rough integrated loudness estimate (dBFS)
  clippedPct: number; // % of samples at/over the ceiling
  lowRatio: number; // low-band energy share
  midRatio: number;
  highRatio: number;
  guesses: {
    quiet: boolean;
    clipping: boolean;
    boomy: boolean;
    harsh: boolean;
    dull: boolean;
  };
}

function onePoleLP(input: Float32Array, fc: number, fs: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / fs);
  const out = new Float32Array(input.length);
  let y = 0;
  for (let i = 0; i < input.length; i++) {
    y += a * (input[i] - y);
    out[i] = y;
  }
  return out;
}

function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

const toDb = (x: number) => (x <= 1e-6 ? -120 : 20 * Math.log10(x));

/** Analyze a decoded vocal clip with real time/frequency-domain measurements. */
export function analyzeBuffer(buffer: AudioBuffer): ClipAnalysis {
  const fs = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
  }

  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
    if (a >= 0.985) clipped++;
  }
  const rms = rmsOf(mono);

  // 3-band split with one-pole filters (cheap, real).
  const lp200 = onePoleLP(mono, 220, fs);
  const lp3500 = onePoleLP(mono, 3800, fs);
  const lowRms = rmsOf(lp200);
  const high = new Float32Array(len);
  const mid = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    high[i] = mono[i] - lp3500[i];
    mid[i] = lp3500[i] - lp200[i];
  }
  const midRms = rmsOf(mid);
  const highRms = rmsOf(high);
  const totalBand = lowRms + midRms + highRms || 1;
  const lowRatio = lowRms / totalBand;
  const midRatio = midRms / totalBand;
  const highRatio = highRms / totalBand;

  // Loudness estimate: RMS biased toward perceived level (rough, not true LUFS).
  const loudnessDb = toDb(rms) + 3;

  const guesses = {
    quiet: rms < 0.06,
    clipping: clipped / len > 0.0004 || peak >= 0.999,
    boomy: lowRatio > 0.5,
    harsh: highRatio > 0.34,
    dull: highRatio < 0.12,
  };

  return {
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    loudnessDb,
    clippedPct: (clipped / len) * 100,
    lowRatio,
    midRatio,
    highRatio,
    guesses,
  };
}

export interface EnhancementResult {
  effects: EffectsState;
  trackGain: number;
  changes: string[];
}

/**
 * Turn an analysis into a concrete, audible effect chain + gain correction,
 * and a human-readable list of what changed. This is deterministic and tasteful
 * rather than a black box.
 */
export function deriveEnhancement(
  a: ClipAnalysis,
  currentTrackGain: number
): EnhancementResult {
  const e = defaultEffects();
  const changes: string[] = [];

  // ---- Gain correction (aim for ~ -16 dBFS RMS) ----
  let trackGain = currentTrackGain;
  if (a.guesses.clipping) {
    trackGain = Math.min(currentTrackGain, 0.8);
    changes.push("Detected clipping → lowered track gain and engaged limiter for protection.");
  } else if (a.guesses.quiet) {
    const targetDb = -16;
    const boostDb = Math.min(12, targetDb - a.rmsDb);
    trackGain = Math.min(2, currentTrackGain * Math.pow(10, boostDb / 20));
    changes.push(`Signal was quiet (${a.rmsDb.toFixed(1)} dBFS RMS) → raised level by ~${boostDb.toFixed(0)} dB.`);
  } else {
    changes.push(`Level OK (${a.rmsDb.toFixed(1)} dBFS RMS) → no gain change needed.`);
  }

  // ---- EQ cleanup ----
  e.eq.enabled = true;
  e.eq.hpf = a.guesses.boomy ? 120 : 85;
  if (a.guesses.boomy) {
    e.eq.lowGain = -3;
    e.eq.lowFreq = 180;
    changes.push("Boomy low end → high-pass at 120 Hz and low-shelf cut.");
  } else {
    changes.push("Applied gentle high-pass at 85 Hz to remove rumble.");
  }
  if (a.guesses.harsh) {
    e.eq.midGain = -3;
    e.eq.midFreq = 3200;
    e.eq.midQ = 1.2;
    changes.push("Harsh mids → 3.2 kHz dip.");
  } else {
    e.eq.midGain = 1.5;
    e.eq.midFreq = 2600;
    changes.push("Added presence lift around 2.6 kHz.");
  }
  if (a.guesses.dull) {
    e.eq.highGain = 4;
    e.eq.highFreq = 11000;
    changes.push("Dull top end → added air shelf (+4 dB @ 11 kHz).");
  } else {
    e.eq.highGain = 2;
    e.eq.highFreq = 11000;
    changes.push("Added a touch of air (+2 dB @ 11 kHz).");
  }

  // ---- Compression ----
  e.compressor.enabled = true;
  e.compressor.threshold = -22;
  e.compressor.ratio = a.guesses.quiet ? 2.5 : 3.5;
  e.compressor.attack = 0.008;
  e.compressor.release = 0.18;
  e.compressor.makeup = a.guesses.clipping ? 1 : 3;
  changes.push(`Compression engaged (${e.compressor.ratio}:1) to even out dynamics.`);

  // ---- De-essing ----
  e.deEsser.enabled = true;
  e.deEsser.freq = 6500;
  e.deEsser.threshold = a.guesses.harsh ? -30 : -27;
  e.deEsser.ratio = a.guesses.harsh ? 6 : 4;
  changes.push(`De-esser engaged at 6.5 kHz (${e.deEsser.ratio}:1).`);

  // ---- Light saturation / warmth ----
  e.saturation.enabled = true;
  e.saturation.drive = 2.5;
  e.saturation.mix = 0.15;
  changes.push("Added light tape-style saturation for warmth.");

  // ---- Tasteful space ----
  e.reverb.enabled = true;
  e.reverb.size = 0.4;
  e.reverb.decay = 0.5;
  e.reverb.mix = 0.15;
  e.delay.enabled = true;
  e.delay.time = 0.26;
  e.delay.feedback = 0.18;
  e.delay.tone = 3500;
  e.delay.mix = 0.1;
  changes.push("Added subtle reverb + slap delay for depth.");

  // ---- Limiter protection ----
  e.limiter.enabled = true;
  e.limiter.threshold = -1;
  e.limiter.release = 0.05;
  changes.push("Brick-wall limiter at -1 dB to prevent overs.");

  return { effects: e, trackGain, changes };
}
