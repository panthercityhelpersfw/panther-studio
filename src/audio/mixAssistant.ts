/**
 * Mix analysis assistant. Renders each track's stem offline and measures real
 * peak / RMS / spectral-band / crest metrics, then derives concrete, human
 * readable issues and one-click fixes. The fixes are applied by the store
 * (applyMixFix) as real changes to track gain / EQ / limiter.
 */
import type { Project } from "../state/types";
import { analyzeBuffer } from "./autoEnhance";
import { renderStem } from "./export";

export type MixFixKind =
  | "raise"
  | "lower"
  | "demud"
  | "deharsh"
  | "deboom"
  | "limiter"
  | "levelRide";

export interface MixIssue {
  severity: "ok" | "warn" | "bad";
  text: string;
}

export interface MixFix {
  kind: MixFixKind;
  label: string;
}

export interface TrackMixReport {
  trackId: string;
  trackName: string;
  hasAudio: boolean;
  peakDb: number;
  rmsDb: number;
  crest: number;
  issues: MixIssue[];
  fixes: MixFix[];
}

export async function analyzeMix(
  project: Project,
  getBuffer: (id: string) => AudioBuffer | undefined
): Promise<TrackMixReport[]> {
  const reports: TrackMixReport[] = [];
  for (const track of project.tracks) {
    const hasAudio = project.clips.some((c) => c.trackId === track.id && c.kind === "audio");
    if (!hasAudio) {
      reports.push({
        trackId: track.id,
        trackName: track.name,
        hasAudio: false,
        peakDb: -120,
        rmsDb: -120,
        crest: 0,
        issues: [{ severity: "ok", text: "No audio on this track." }],
        fixes: [],
      });
      continue;
    }
    let buffer: AudioBuffer;
    try {
      buffer = await renderStem(project, getBuffer, track.id);
    } catch {
      continue;
    }
    const a = analyzeBuffer(buffer);
    const crest = a.peakDb - a.rmsDb;
    const issues: MixIssue[] = [];
    const fixes: MixFix[] = [];

    if (a.guesses.clipping || a.peakDb >= -0.1) {
      issues.push({ severity: "bad", text: `Clipping / no headroom (peak ${a.peakDb.toFixed(1)} dB).` });
      fixes.push({ kind: "lower", label: "Lower & add limiter" });
    } else if (a.peakDb > -3) {
      issues.push({ severity: "warn", text: `Hot peaks (${a.peakDb.toFixed(1)} dB) — little headroom.` });
      fixes.push({ kind: "lower", label: "Lower a touch" });
    }
    if (a.rmsDb < -30) {
      issues.push({ severity: "warn", text: `Low level (${a.rmsDb.toFixed(1)} dBFS RMS).` });
      fixes.push({ kind: "raise", label: "Raise level" });
      fixes.push({ kind: "levelRide", label: "Auto level-ride" });
    }
    if (a.guesses.boomy) {
      issues.push({ severity: "warn", text: "Muddy / boomy low end." });
      fixes.push({ kind: "deboom", label: "High-pass + low cut" });
    } else if (a.lowRatio > 0.42) {
      issues.push({ severity: "warn", text: "Low-mid build-up (mud)." });
      fixes.push({ kind: "demud", label: "Cut 300 Hz mud" });
    }
    if (a.guesses.harsh) {
      issues.push({ severity: "warn", text: "Harsh / bright highs." });
      fixes.push({ kind: "deharsh", label: "Tame harsh highs" });
    }
    if (crest < 6 && a.rmsDb > -22) {
      issues.push({ severity: "warn", text: `Over-compressed (crest ${crest.toFixed(1)} dB).` });
    }
    if (issues.length === 0) {
      issues.push({ severity: "ok", text: `Healthy (peak ${a.peakDb.toFixed(1)} dB, RMS ${a.rmsDb.toFixed(1)} dB).` });
    }

    reports.push({
      trackId: track.id,
      trackName: track.name,
      hasAudio: true,
      peakDb: a.peakDb,
      rmsDb: a.rmsDb,
      crest,
      issues,
      fixes,
    });
  }
  return reports;
}

/**
 * Vocal level-rider: smooths a clip's loudness so quiet and loud passages sit
 * closer together. Computes a slow RMS envelope and applies make-up gain toward
 * a target, limited to a sensible range. Returns a new AudioBuffer.
 */
export function levelRide(buffer: AudioBuffer, targetRms = 0.16, maxBoostDb = 9): AudioBuffer {
  const fs = buffer.sampleRate;
  const len = buffer.length;
  const numCh = buffer.numberOfChannels;
  // Envelope from a mono mix.
  const mono = new Float32Array(len);
  for (let c = 0; c < numCh; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / numCh;
  }
  const winN = Math.floor(fs * 0.15);
  const env = new Float32Array(len);
  // Moving RMS.
  let acc = 0;
  for (let i = 0; i < len; i++) {
    acc += mono[i] * mono[i];
    if (i >= winN) acc -= mono[i - winN] * mono[i - winN];
    env[i] = Math.sqrt(acc / Math.min(i + 1, winN));
  }
  const maxBoost = Math.pow(10, maxBoostDb / 20);
  const minGain = 0.3;
  const out = new OfflineAudioContext(numCh, len, fs).createBuffer(numCh, len, fs);
  // Smooth the gain so it rides, not pumps.
  const coef = Math.exp(-1 / (fs * 0.05));
  let g = 1;
  const gainArr = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const e = env[i];
    let target = e > 1e-4 ? targetRms / e : 1;
    target = Math.max(minGain, Math.min(maxBoost, target));
    g = target + (g - target) * coef;
    gainArr[i] = g;
  }
  for (let c = 0; c < numCh; c++) {
    const d = buffer.getChannelData(c);
    const o = out.getChannelData(c);
    for (let i = 0; i < len; i++) o[i] = Math.max(-1, Math.min(1, d[i] * gainArr[i]));
  }
  return out;
}
