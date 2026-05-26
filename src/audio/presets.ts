import { defaultEffects, type EffectsState } from "./effects/types";

export interface VocalPreset {
  id: string;
  name: string;
  description: string;
  build: () => EffectsState;
}

/**
 * Real presets. Each returns a full EffectsState (neutral defaults overridden
 * with deliberate values), so applying one configures the actual Web Audio
 * chain — there is nothing cosmetic here.
 */
export const PRESETS: VocalPreset[] = [
  {
    id: "bedroom-studio-cleaner",
    name: "Bedroom Studio Cleaner",
    description: "Condenser mic cleanup for untreated rooms: gate, high-pass, de-ess, compression, room/mud control, air, and limiter.",
    build: () => {
      const e = defaultEffects();
      e.gate = { ...e.gate, enabled: true, threshold: -47, release: 0.12 };
      e.eq = { ...e.eq, enabled: true, hpf: 105, lowGain: -3.2, lowFreq: 260, midGain: -2.4, midFreq: 420, midQ: 1.15, highGain: 2.8, highFreq: 11800 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6600, threshold: -31, ratio: 5.5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -24, ratio: 3.8, attack: 0.006, release: 0.16, makeup: 3.2 };
      e.saturation = { ...e.saturation, enabled: true, drive: 1.6, mix: 0.1 };
      e.reverb = { ...e.reverb, enabled: false, size: 0.18, decay: 0.18, mix: 0.02 };
      e.delay = { ...e.delay, enabled: false, mix: 0 };
      e.doubler = { ...e.doubler, enabled: false, mix: 0 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.1, release: 0.05 };
      return e;
    },
  },
  {
    id: "clean-pop",
    name: "Clean Pop Vocal",
    description: "Bright, controlled, radio-ready. HPF, gentle EQ lift, smooth comp, de-ess, light air + short reverb.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 90, lowGain: -1, midGain: 1.5, midFreq: 3000, midQ: 0.8, highGain: 3, highFreq: 11000 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6500, threshold: -30, ratio: 4 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -22, ratio: 3, attack: 0.008, release: 0.16, makeup: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 2, mix: 0.18 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.35, decay: 0.45, mix: 0.16 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1, release: 0.05 };
      return e;
    },
  },
  {
    id: "rap",
    name: "Rap Vocal",
    description: "Upfront and punchy. Tight gate, aggressive comp, presence push, slap delay, minimal reverb.",
    build: () => {
      const e = defaultEffects();
      e.gate = { ...e.gate, enabled: true, threshold: -45, release: 0.1 };
      e.eq = { ...e.eq, enabled: true, hpf: 100, midGain: 2, midFreq: 2200, highGain: 2.5, highFreq: 10000 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 7000, threshold: -28, ratio: 5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -24, ratio: 5, attack: 0.004, release: 0.12, makeup: 5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 4, mix: 0.28 };
      e.delay = { ...e.delay, enabled: true, time: 0.22, feedback: 0.2, tone: 3500, mix: 0.12 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.8, release: 0.04 };
      return e;
    },
  },
  {
    id: "emotional",
    name: "Emotional Singing",
    description: "Intimate and lush. Soft comp, warm body, doubler width, longer reverb and delay tail.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 80, lowGain: 1.5, lowFreq: 200, midGain: -1, midFreq: 900, highGain: 2.5, highFreq: 12000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -20, ratio: 2.5, attack: 0.015, release: 0.25, makeup: 2 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6500, threshold: -32, ratio: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 2, mix: 0.2 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 7, rate: 0.9, spread: 0.7, mix: 0.25 };
      e.delay = { ...e.delay, enabled: true, time: 0.38, feedback: 0.32, tone: 3500, mix: 0.16 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.7, decay: 0.6, preDelay: 0.02, mix: 0.3 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5, release: 0.08 };
      return e;
    },
  },
  {
    id: "warm-podcast",
    name: "Warm Podcast",
    description: "Spoken-word clarity. Gate, low-mid warmth, broadcast comp, de-ess, no time FX.",
    build: () => {
      const e = defaultEffects();
      e.gate = { ...e.gate, enabled: true, threshold: -48, release: 0.15 };
      e.eq = { ...e.eq, enabled: true, hpf: 85, lowGain: 2, lowFreq: 160, midGain: -1.5, midFreq: 500, highGain: 1.5, highFreq: 9000 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6000, threshold: -30, ratio: 4 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -20, ratio: 3.5, attack: 0.012, release: 0.2, makeup: 4 };
      e.saturation = { ...e.saturation, enabled: true, drive: 2.5, mix: 0.2 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5, release: 0.07 };
      return e;
    },
  },
  {
    id: "deep-voice",
    name: "Deep Voice",
    description: "Big and authoritative. Low-shelf weight, dipped harsh mids, controlled highs, saturation.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 60, lowGain: 4, lowFreq: 150, midGain: -2.5, midFreq: 1500, midQ: 1.1, highGain: -1, highFreq: 9000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -22, ratio: 3, attack: 0.01, release: 0.22, makeup: 3 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6000, threshold: -30, ratio: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 5, mix: 0.3 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1, release: 0.06 };
      return e;
    },
  },
  {
    id: "bright-airy",
    name: "Bright Airy Vocal",
    description: "Sparkly top end. Strong air shelf, presence, careful de-ess, shimmer reverb + doubler.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 95, lowGain: -1.5, midGain: 1, midFreq: 4000, highGain: 5, highFreq: 13000 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 7000, threshold: -26, ratio: 6 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -22, ratio: 3, attack: 0.006, release: 0.15, makeup: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 2, mix: 0.15 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 5, rate: 1.3, spread: 0.6, mix: 0.2 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.5, decay: 0.55, mix: 0.22 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1, release: 0.05 };
      return e;
    },
  },
  {
    id: "raw-monitor",
    name: "Raw Studio Monitor",
    description: "Minimal processing for tracking/monitoring. HPF, light comp, brick-wall limiter only.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 80, lowGain: 0, midGain: 0, highGain: 0 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -18, ratio: 2, attack: 0.01, release: 0.18, makeup: 1 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1, release: 0.06 };
      return e;
    },
  },
  {
    id: "rnb-silk",
    name: "R&B Silk Vocal",
    description: "Smooth, warm, and wide. Soft compression, gentle low-mid body, tasteful delay and plate.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 75, lowGain: 1.4, lowFreq: 190, midGain: -1.1, midFreq: 850, midQ: 1, highGain: 2.2, highFreq: 10500 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6400, threshold: -31, ratio: 4 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -23, ratio: 2.4, attack: 0.014, release: 0.24, makeup: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 2.2, mix: 0.18 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 5, rate: 0.8, spread: 0.48, mix: 0.16 };
      e.delay = { ...e.delay, enabled: true, time: 0.34, feedback: 0.28, tone: 3200, mix: 0.14 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.55, decay: 0.5, preDelay: 0.018, mix: 0.22 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2, release: 0.07 };
      return e;
    },
  },
  {
    id: "rock-vocal",
    name: "Rock Vocal",
    description: "Dense, forward, and midrange-present. Saturation, compression, de-ess, and a short room.",
    build: () => {
      const e = defaultEffects();
      e.gate = { ...e.gate, enabled: true, threshold: -46, release: 0.11 };
      e.eq = { ...e.eq, enabled: true, hpf: 95, lowGain: -0.8, midGain: 3.2, midFreq: 1800, midQ: 0.85, highGain: 1.4, highFreq: 9000 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6600, threshold: -29, ratio: 4.5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -25, ratio: 4.5, attack: 0.004, release: 0.13, makeup: 4.5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 6, mix: 0.34 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.28, decay: 0.25, preDelay: 0.012, mix: 0.1 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.8, release: 0.05 };
      return e;
    },
  },
  {
    id: "adlib-wide",
    name: "Ad-lib Wide",
    description: "Filtered, tucked, stereo ad-lib chain with delay so it supports without fighting the lead.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 180, lowGain: -5, midGain: 1.8, midFreq: 2600, highGain: -2.5, highFreq: 7200 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -26, ratio: 4, attack: 0.006, release: 0.13, makeup: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 4.5, mix: 0.26 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 9, rate: 1.5, spread: 0.82, mix: 0.42 };
      e.delay = { ...e.delay, enabled: true, time: 0.22, feedback: 0.35, tone: 3000, mix: 0.22 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.42, decay: 0.38, mix: 0.16 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5 };
      return e;
    },
  },
  {
    id: "harmony-bed",
    name: "Harmony Bed",
    description: "Soft, controlled background harmony tone with less consonant bite and more glue.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 130, lowGain: -2.2, midGain: -0.8, midFreq: 1200, highGain: -1.2, highFreq: 7600 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6100, threshold: -33, ratio: 5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -27, ratio: 3.8, attack: 0.01, release: 0.2, makeup: 3.5 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 7, rate: 0.9, spread: 0.76, mix: 0.36 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.6, decay: 0.54, preDelay: 0.02, mix: 0.28 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.4 };
      return e;
    },
  },
  {
    id: "telephone-vocal",
    name: "Telephone Vocal",
    description: "Narrow, distorted band-pass vocal for ad-libs, bridges, and contrast moments.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 520, lowGain: -10, midGain: 5, midFreq: 1900, midQ: 1.6, highGain: -11, highFreq: 3900 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -27, ratio: 5.5, attack: 0.004, release: 0.1, makeup: 5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 8, mix: 0.44 };
      e.delay = { ...e.delay, enabled: true, time: 0.18, feedback: 0.22, tone: 2400, mix: 0.12 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "lofi-vocal",
    name: "Lo-fi Vocal",
    description: "Darker, compressed, slightly dirty vocal with rolled-off top and short ambience.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 120, lowGain: 1, lowFreq: 220, midGain: 1.2, midFreq: 1400, highGain: -5, highFreq: 6200 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -26, ratio: 5, attack: 0.008, release: 0.18, makeup: 4 };
      e.saturation = { ...e.saturation, enabled: true, drive: 7, mix: 0.38 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.32, decay: 0.3, mix: 0.14 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5 };
      return e;
    },
  },
  {
    id: "wide-hook",
    name: "Wide Hook Vocal",
    description: "Hook lift chain: controlled lead vocal, extra width, light ambience, and limiter safety.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 100, lowGain: -1, midGain: 1.7, midFreq: 2600, highGain: 2.5, highFreq: 10500 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6900, threshold: -29, ratio: 4.5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -24, ratio: 3.5, attack: 0.006, release: 0.15, makeup: 4 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 6, rate: 1.2, spread: 0.7, mix: 0.24 };
      e.delay = { ...e.delay, enabled: true, time: 0.29, feedback: 0.24, tone: 3600, mix: 0.1 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.42, decay: 0.38, preDelay: 0.018, mix: 0.16 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.9 };
      return e;
    },
  },
  {
    id: "aggressive-mix-vocal",
    name: "Aggressive Mix Vocal",
    description: "Loud, dense, mix-cutting vocal for high-energy rap/pop hooks.",
    build: () => {
      const e = defaultEffects();
      e.gate = { ...e.gate, enabled: true, threshold: -44, release: 0.09 };
      e.eq = { ...e.eq, enabled: true, hpf: 105, lowGain: -2, midGain: 3.5, midFreq: 2400, midQ: 0.75, highGain: 2, highFreq: 9600 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 7000, threshold: -27, ratio: 5.5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -28, ratio: 6, attack: 0.003, release: 0.1, makeup: 6 };
      e.saturation = { ...e.saturation, enabled: true, drive: 7.5, mix: 0.36 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.7, release: 0.04 };
      return e;
    },
  },
];

export function getPreset(id: string): VocalPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
