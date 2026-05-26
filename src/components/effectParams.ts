import type { EffectKey } from "../audio/effects/types";

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const ms = (v: number) => `${Math.round(v * 1000)}ms`;
const ratio = (v: number) => `${v.toFixed(1)}:1`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (v: number) => v.toFixed(2);
const hzNum = (v: number) => `${v.toFixed(1)}Hz`;

export const PARAMS: Record<EffectKey, ParamDef[]> = {
  gate: [
    { key: "threshold", label: "Thresh", min: -80, max: 0, step: 1, format: db },
    { key: "attack", label: "Attack", min: 0.001, max: 0.05, step: 0.001, format: ms },
    { key: "release", label: "Release", min: 0.02, max: 0.6, step: 0.01, format: ms },
    { key: "floor", label: "Floor", min: 0, max: 1, step: 0.01, format: pct },
  ],
  eq: [
    { key: "hpf", label: "HPF", min: 20, max: 400, step: 1, format: hz },
    { key: "lowGain", label: "Low", min: -12, max: 12, step: 0.5, format: db },
    { key: "lowFreq", label: "LoFrq", min: 60, max: 400, step: 5, format: hz },
    { key: "midGain", label: "Mid", min: -12, max: 12, step: 0.5, format: db },
    { key: "midFreq", label: "MdFrq", min: 300, max: 8000, step: 50, format: hz },
    { key: "midQ", label: "Q", min: 0.2, max: 4, step: 0.1, format: num },
    { key: "highGain", label: "Air", min: -12, max: 12, step: 0.5, format: db },
    { key: "highFreq", label: "HiFrq", min: 3000, max: 16000, step: 100, format: hz },
  ],
  deEsser: [
    { key: "freq", label: "Freq", min: 3000, max: 12000, step: 100, format: hz },
    { key: "threshold", label: "Thresh", min: -60, max: 0, step: 1, format: db },
    { key: "ratio", label: "Ratio", min: 1, max: 10, step: 0.5, format: ratio },
  ],
  compressor: [
    { key: "threshold", label: "Thresh", min: -60, max: 0, step: 1, format: db },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.5, format: ratio },
    { key: "attack", label: "Attack", min: 0.001, max: 0.2, step: 0.001, format: ms },
    { key: "release", label: "Release", min: 0.02, max: 1, step: 0.01, format: ms },
    { key: "knee", label: "Knee", min: 0, max: 40, step: 1, format: db },
    { key: "makeup", label: "Makeup", min: 0, max: 18, step: 0.5, format: db },
  ],
  saturation: [
    { key: "drive", label: "Drive", min: 1, max: 20, step: 0.5, format: num },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  doubler: [
    { key: "depthMs", label: "Depth", min: 0, max: 20, step: 0.5, format: (v) => `${v.toFixed(1)}ms` },
    { key: "rate", label: "Rate", min: 0.1, max: 6, step: 0.1, format: hzNum },
    { key: "spread", label: "Spread", min: 0, max: 1, step: 0.01, format: pct },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  delay: [
    { key: "time", label: "Time", min: 0.02, max: 1.2, step: 0.01, format: ms },
    { key: "feedback", label: "F.Back", min: 0, max: 0.95, step: 0.01, format: pct },
    { key: "tone", label: "Tone", min: 500, max: 12000, step: 100, format: hz },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  reverb: [
    { key: "size", label: "Size", min: 0, max: 1, step: 0.01, format: pct },
    { key: "decay", label: "Decay", min: 0, max: 1, step: 0.01, format: pct },
    { key: "preDelay", label: "Pre", min: 0, max: 0.1, step: 0.005, format: ms },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  limiter: [
    { key: "threshold", label: "Ceiling", min: -24, max: 0, step: 0.5, format: db },
    { key: "release", label: "Release", min: 0.01, max: 0.5, step: 0.01, format: ms },
  ],
};
