import { defaultEffects, type EffectsState } from "./effects/types";

export interface MasterPreset {
  id: string;
  name: string;
  description: string;
  build: () => { effects: EffectsState; outputGain: number };
}

/**
 * Master-bus presets. Each enables a real subset of the master chain
 * (EQ → glue compressor → saturation → limiter) plus an output gain. Only those
 * four stages are used on the master; the rest stay disabled.
 */
export const MASTER_PRESETS: MasterPreset[] = [
  {
    id: "streaming-safe",
    name: "Streaming Safe",
    description: "Transparent glue + true-peak-safe limiting, aimed near streaming loudness.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 24, lowGain: 0, midGain: 0, highGain: 1, highFreq: 12000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -18, ratio: 2, attack: 0.02, release: 0.25, knee: 8, makeup: 1 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1, release: 0.08 };
      return { effects: e, outputGain: 1.0 };
    },
  },
  {
    id: "loud-rap",
    name: "Loud Rap Demo",
    description: "Aggressive glue, saturation and hard limiting for a loud demo.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 30, lowGain: 1.5, lowFreq: 90, highGain: 2, highFreq: 11000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -20, ratio: 3, attack: 0.005, release: 0.15, knee: 4, makeup: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 4, mix: 0.25 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.7, release: 0.04 };
      return { effects: e, outputGain: 1.15 };
    },
  },
  {
    id: "clean-vocal-mix",
    name: "Clean Vocal Mix",
    description: "Light polish: subtle top-end air and gentle peak control.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 26, highGain: 1.5, highFreq: 13000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -16, ratio: 1.8, attack: 0.025, release: 0.3, knee: 10, makeup: 0.5 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2, release: 0.1 };
      return { effects: e, outputGain: 1.0 };
    },
  },
  {
    id: "podcast-master",
    name: "Podcast Master",
    description: "Speech-leveling compression and a safe ceiling for spoken word.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 60, lowGain: 1, lowFreq: 150, midGain: -1, midFreq: 500, highGain: 1.5, highFreq: 9000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -22, ratio: 3.5, attack: 0.01, release: 0.2, knee: 6, makeup: 4 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5, release: 0.1 };
      return { effects: e, outputGain: 1.0 };
    },
  },
  {
    id: "warm-emotional",
    name: "Warm Emotional Vocal",
    description: "Low-end warmth, soft saturation and gentle, musical limiting.",
    build: () => {
      const e = defaultEffects();
      e.eq = { ...e.eq, enabled: true, hpf: 28, lowGain: 2, lowFreq: 120, midGain: -1, midFreq: 1200, highGain: 1, highFreq: 12000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -18, ratio: 2, attack: 0.03, release: 0.35, knee: 10, makeup: 1.5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 3, mix: 0.2 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2, release: 0.12 };
      return { effects: e, outputGain: 1.0 };
    },
  },
];

export function getMasterPreset(id: string): MasterPreset | undefined {
  return MASTER_PRESETS.find((p) => p.id === id);
}
