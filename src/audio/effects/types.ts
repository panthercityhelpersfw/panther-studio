/**
 * Serializable per-track effect chain state. Every field maps to a real Web
 * Audio parameter (see EffectChain.ts). Defaults are neutral / disabled so that
 * adding the effects system to an existing project changes nothing until the
 * user (or a preset / auto-enhance) turns effects on.
 *
 * Signal order (fixed, canonical vocal chain):
 *   gate -> eq -> deEsser -> compressor -> saturation -> doubler -> delay ->
 *   reverb -> limiter
 */

export interface EQState {
  enabled: boolean;
  hpf: number; // high-pass cutoff Hz (rumble removal); 20 = off
  lowGain: number; // dB
  lowFreq: number; // Hz (low shelf)
  midGain: number; // dB
  midFreq: number; // Hz (peaking)
  midQ: number;
  highGain: number; // dB
  highFreq: number; // Hz (high shelf / air)
}

export interface CompressorState {
  enabled: boolean;
  threshold: number; // dB
  ratio: number;
  attack: number; // seconds
  release: number; // seconds
  knee: number; // dB
  makeup: number; // dB
}

export interface GateState {
  enabled: boolean;
  threshold: number; // dB (below this -> gate closes)
  attack: number; // seconds (open)
  release: number; // seconds (close)
  floor: number; // residual gain when closed (0..1)
}

export interface DeEsserState {
  enabled: boolean;
  freq: number; // crossover Hz for the sibilance band
  threshold: number; // dB
  ratio: number;
}

export interface SaturationState {
  enabled: boolean;
  drive: number; // 1..20 pre-gain into the shaper
  mix: number; // 0..1 wet
}

export interface DoublerState {
  enabled: boolean;
  depthMs: number; // modulation depth (ms)
  rate: number; // LFO Hz
  spread: number; // 0..1 stereo spread
  mix: number; // 0..1 wet
}

export interface DelayState {
  enabled: boolean;
  time: number; // seconds
  feedback: number; // 0..0.95
  tone: number; // low-pass on repeats, Hz
  mix: number; // 0..1 wet
}

export interface ReverbState {
  enabled: boolean;
  size: number; // 0..1 -> IR length
  decay: number; // 0..1 -> decay curve
  preDelay: number; // seconds
  mix: number; // 0..1 wet
}

export interface LimiterState {
  enabled: boolean;
  threshold: number; // dB ceiling
  release: number; // seconds
}

export interface EffectsState {
  gate: GateState;
  eq: EQState;
  deEsser: DeEsserState;
  compressor: CompressorState;
  saturation: SaturationState;
  doubler: DoublerState;
  delay: DelayState;
  reverb: ReverbState;
  limiter: LimiterState;
}

export type EffectKey = keyof EffectsState;

export const EFFECT_ORDER: EffectKey[] = [
  "gate",
  "eq",
  "deEsser",
  "compressor",
  "saturation",
  "doubler",
  "delay",
  "reverb",
  "limiter",
];

export const EFFECT_LABELS: Record<EffectKey, string> = {
  gate: "Noise Gate",
  eq: "EQ",
  deEsser: "De-Esser",
  compressor: "Compressor",
  saturation: "Saturation",
  doubler: "Doubler / Chorus",
  delay: "Delay",
  reverb: "Reverb",
  limiter: "Limiter",
};

export function defaultEffects(): EffectsState {
  return {
    gate: { enabled: false, threshold: -50, attack: 0.005, release: 0.12, floor: 0 },
    eq: {
      enabled: false,
      hpf: 80,
      lowGain: 0,
      lowFreq: 180,
      midGain: 0,
      midFreq: 2500,
      midQ: 0.9,
      highGain: 0,
      highFreq: 9000,
    },
    deEsser: { enabled: false, freq: 6500, threshold: -28, ratio: 4 },
    compressor: {
      enabled: false,
      threshold: -22,
      ratio: 3,
      attack: 0.01,
      release: 0.18,
      knee: 6,
      makeup: 0,
    },
    saturation: { enabled: false, drive: 3, mix: 0.3 },
    doubler: { enabled: false, depthMs: 6, rate: 1.2, spread: 0.6, mix: 0.3 },
    delay: { enabled: false, time: 0.28, feedback: 0.28, tone: 4000, mix: 0.18 },
    reverb: { enabled: false, size: 0.5, decay: 0.5, preDelay: 0.01, mix: 0.22 },
    limiter: { enabled: false, threshold: -1, release: 0.06 },
  };
}

/** Deep-merge stored (possibly partial / older) effects onto fresh defaults. */
export function normalizeEffects(input?: Partial<EffectsState>): EffectsState {
  const base = defaultEffects();
  if (!input) return base;
  const out = base as unknown as Record<string, Record<string, unknown>>;
  for (const key of EFFECT_ORDER) {
    const stored = (input as Record<string, unknown>)[key];
    if (stored && typeof stored === "object") {
      out[key] = { ...out[key], ...(stored as Record<string, unknown>) };
    }
  }
  return out as unknown as EffectsState;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
