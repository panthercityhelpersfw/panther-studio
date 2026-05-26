import { defaultEffects, dbToGain, type EffectsState } from "./effects/types";
import type { LoudnessResult } from "./loudness";

export type LoudnessTarget =
  | "streaming"
  | "youtube"
  | "tiktok"
  | "loud"
  | "clean-pop"
  | "quiet-podcast";

const TARGET_LUFS: Record<LoudnessTarget, number> = {
  streaming: -14, // Spotify / Apple Music
  youtube: -14,
  tiktok: -14, // TikTok/Reels normalize ~-14
  loud: -8, // loud rap demo
  "clean-pop": -12,
  "quiet-podcast": -16,
};

export const TARGET_LABELS: Record<LoudnessTarget, string> = {
  streaming: "Spotify / Streaming (-14)",
  youtube: "YouTube (-14)",
  tiktok: "TikTok / Reels (-14)",
  loud: "Loud Rap (-8)",
  "clean-pop": "Clean Pop (-12)",
  "quiet-podcast": "Podcast (-16)",
};

export interface AutoMasterResult {
  effects: EffectsState;
  outputGain: number;
  changes: string[];
}

/**
 * Build a master chain + output gain from a loudness analysis of the current
 * mix, aiming at a target loudness. Deterministic and conservative: it raises or
 * lowers output toward the target, adds gentle glue compression, a polish EQ,
 * light saturation when quiet, and a true-peak-safe limiter. The actual loudness
 * achieved is re-measurable with "Analyze Loudness" after applying.
 */
export function deriveMaster(
  loud: LoudnessResult,
  currentOutputGain: number,
  target: LoudnessTarget = "streaming"
): AutoMasterResult {
  const e = defaultEffects();
  const changes: string[] = [];
  const targetLufs = TARGET_LUFS[target];

  // ---- Output gain toward target loudness ----
  // The limiter will catch the extra level; we still avoid absurd boosts.
  let gainDb = targetLufs - loud.lufsApprox;
  gainDb = Math.max(-12, Math.min(12, gainDb));
  let outputGain = Math.max(0.05, Math.min(2, currentOutputGain * dbToGain(gainDb)));
  if (gainDb >= 0.5) {
    changes.push(`Mix was ~${loud.lufsApprox.toFixed(1)} LUFS → raised output ~${gainDb.toFixed(1)} dB toward ${targetLufs} LUFS (${target}).`);
  } else if (gainDb <= -0.5) {
    changes.push(`Mix was ~${loud.lufsApprox.toFixed(1)} LUFS → lowered output ~${(-gainDb).toFixed(1)} dB toward ${targetLufs} LUFS (${target}).`);
  } else {
    changes.push(`Mix is already near the ${targetLufs} LUFS target.`);
  }

  // ---- EQ polish ----
  e.eq.enabled = true;
  e.eq.hpf = 26;
  e.eq.highGain = 1.5;
  e.eq.highFreq = 12500;
  changes.push("EQ polish: sub-rumble high-pass + a touch of air.");

  // ---- Glue compression ----
  e.compressor.enabled = true;
  e.compressor.threshold = -18;
  e.compressor.ratio = 2;
  e.compressor.attack = 0.02;
  e.compressor.release = 0.25;
  e.compressor.knee = 8;
  e.compressor.makeup = 1;
  changes.push("Gentle glue compression (2:1) to bind the mix.");

  // ---- Light saturation when the mix is quiet/thin ----
  if (loud.lufsApprox < -16) {
    e.saturation.enabled = true;
    e.saturation.drive = 2.5;
    e.saturation.mix = 0.15;
    changes.push("Added light saturation for density.");
  }

  // ---- Limiter / clipping protection ----
  e.limiter.enabled = true;
  e.limiter.threshold = target === "loud" ? -0.8 : -1;
  e.limiter.release = 0.08;
  if (loud.clippedPct > 0.01 || loud.peak >= 0.999) {
    changes.push(`Clipping was detected → limiter ceiling at ${e.limiter.threshold} dB to prevent overs.`);
  } else {
    changes.push(`Brick-wall limiter at ${e.limiter.threshold} dB for safe peaks.`);
  }

  return { effects: e, outputGain, changes };
}
