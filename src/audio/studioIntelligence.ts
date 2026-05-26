import type { Project, Track, MidiNote } from "../state/types";
import { analyzeBuffer, type ClipAnalysis } from "./autoEnhance";
import { detectPitchTrack, KEY_NAMES, SCALES, type ScaleId } from "./autotune";
import { defaultEffects, type EffectsState } from "./effects/types";
import { renderMixdown, renderStem } from "./export";

export type IntelligenceDomain =
  | "pitch"
  | "timing"
  | "vocal"
  | "mix"
  | "master"
  | "arrangement"
  | "fx"
  | "performance"
  | "memory";

export type RecommendationAction =
  | { kind: "cleanup-vocal"; clipId: string }
  | { kind: "autotune"; clipId: string }
  | { kind: "level-ride"; clipId: string }
  | { kind: "track-preset"; trackId: string; presetId: string }
  | { kind: "master-target"; target: "spotify" | "youtube" | "tiktok" | "apple" | "podcast" | "loud-demo" | "dynamic" }
  | { kind: "auto-gain-stage" }
  | { kind: "stereo-width"; value: number; monoBelowHz?: number }
  | { kind: "add-marker"; timeSec: number; name: string }
  | { kind: "double-vocal"; clipId: string }
  | { kind: "harmony-draft"; clipId: string }
  | { kind: "notes"; text: string };

export interface IntelligenceEvidence {
  metric: string;
  value: number | string;
  threshold?: number | string;
  source: string;
}

export interface StudioRecommendation {
  id: string;
  domain: IntelligenceDomain;
  title: string;
  detail: string;
  severity: "info" | "low" | "medium" | "high";
  confidence: number;
  impact: number;
  urgency: number;
  safeToAutoFix: boolean;
  requiresApproval: boolean;
  informationalOnly: boolean;
  evidence: IntelligenceEvidence[];
  action?: RecommendationAction;
  createdAt: number;
}

export interface ClipIntelligence {
  clipId: string;
  trackId: string;
  name: string;
  startSec: number;
  durationSec: number;
  analysis: ClipAnalysis;
  pitch?: {
    voicedPct: number;
    averageCentsError: number;
    driftCents: number;
    vibratoCents: number;
    detectedKey: string;
  };
  timing: {
    onsetCount: number;
    averageGridOffsetMs: number;
    tightness: number;
  };
  vocal: {
    phraseCount: number;
    consistency: number;
    intelligibility: number;
    sibilance: number;
    nasal: number;
    thin: number;
    emotionalEnergy: number;
  };
  stereo: {
    correlation: number;
    width: number;
    monoRisk: number;
  };
  transient: {
    densityPerSecond: number;
    averageAttack: number;
  };
}

export interface TrackIntelligence {
  trackId: string;
  name: string;
  clipCount: number;
  audioDurationSec: number;
  midiNoteCount: number;
  peakDb: number;
  rmsDb: number;
  crestDb: number;
  lowRatio: number;
  midRatio: number;
  highRatio: number;
  maskingRisk: number;
  role: "vocal" | "drums" | "bass" | "music" | "master" | "unknown";
}

export interface ArrangementSection {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  energy: number;
  vocalDensity: number;
  midiDensity: number;
  inferredRole: "intro" | "verse" | "hook" | "bridge" | "drop" | "outro" | "section";
}

export interface StudioScores {
  pitchAccuracy: number;
  timingTightness: number;
  vocalConsistency: number;
  vocalIntelligibility: number;
  mixClarity: number;
  tonalBalance: number;
  dynamicControl: number;
  stereoBalance: number;
  masterReadiness: number;
  arrangementFlow: number;
  hookEnergy: number;
  vocalPresence: number;
  beatVocalCompatibility: number;
  exportReadiness: number;
  overall: number;
}

export interface StudioIntelligenceMemory {
  preferredVocalTone: {
    brightness: number;
    dryness: number;
    saturation: number;
    width: number;
  };
  preferredLoudnessDb: number;
  genreTags: Record<string, number>;
  favoritePresetIds: Record<string, number>;
  acceptedSuggestionKinds: Record<string, number>;
  rejectedSuggestionKinds: Record<string, number>;
  recurringVocalProblems: Record<string, number>;
  recurringMixProblems: Record<string, number>;
  workflowHabits: Record<string, number>;
  exportTargets: Record<string, number>;
  favoriteBpmRanges: Record<string, number>;
  favoriteVocalChains: Record<string, number>;
  favoriteArrangementStructures: Record<string, number>;
  favoriteFxUsage: Record<string, number>;
  commonMistakes: Record<string, number>;
  preferredMixStyle: Record<string, number>;
  preferredMasterStyle: Record<string, number>;
  lastWorkflowIntent?: string;
  updatedAt: number;
}

export interface StudioIntelligenceSnapshot {
  id: string;
  createdAt: number;
  projectId: string;
  projectName: string;
  analyzerVersion: number;
  durationSec: number;
  trackCount: number;
  clipCount: number;
  keyEstimate: string;
  scaleEstimate: string;
  scores: StudioScores;
  clips: ClipIntelligence[];
  tracks: TrackIntelligence[];
  sections: ArrangementSection[];
  recommendations: StudioRecommendation[];
  master: {
    peakDb: number;
    rmsDb: number;
    loudnessDb: number;
    crestDb: number;
    clippingPct: number;
    lowRatio: number;
    midRatio: number;
    highRatio: number;
    stereoWidth: number;
    monoBelowHz: number;
  } | null;
  performance: {
    frozenTracks: number;
    liveEffectSlots: number;
    decodedAssets: number;
    estimatedComplexity: number;
    risk: "low" | "medium" | "high";
  };
}

export interface FactoryPreset {
  id: string;
  name: string;
  category:
    | "vocal"
    | "rap"
    | "pop"
    | "rnb"
    | "rock"
    | "podcast"
    | "adlib"
    | "harmony"
    | "double"
    | "instrument"
    | "drums"
    | "bass"
    | "synth"
    | "master"
    | "creative";
  intendedUse: string;
  genreTags: string[];
  intensity: "subtle" | "medium" | "bold";
  wetDry: number;
  routing: "track" | "bus" | "master" | "send";
  build: () => EffectsState;
}

const ANALYZER_VERSION = 1;
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const scoreFromDbDistance = (db: number, target: number, scale: number) =>
  clamp(100 - Math.abs(db - target) * scale);

export function defaultStudioMemory(): StudioIntelligenceMemory {
  return {
    preferredVocalTone: { brightness: 0.52, dryness: 0.55, saturation: 0.35, width: 0.35 },
    preferredLoudnessDb: -14,
    genreTags: {},
    favoritePresetIds: {},
    acceptedSuggestionKinds: {},
    rejectedSuggestionKinds: {},
    recurringVocalProblems: {},
    recurringMixProblems: {},
    workflowHabits: {},
    exportTargets: {},
    favoriteBpmRanges: {},
    favoriteVocalChains: {},
    favoriteArrangementStructures: {},
    favoriteFxUsage: {},
    commonMistakes: {},
    preferredMixStyle: {},
    preferredMasterStyle: {},
    updatedAt: Date.now(),
  };
}

export function normalizeStudioMemory(input?: Partial<StudioIntelligenceMemory>): StudioIntelligenceMemory {
  const base = defaultStudioMemory();
  return {
    ...base,
    ...input,
    preferredVocalTone: { ...base.preferredVocalTone, ...(input?.preferredVocalTone ?? {}) },
    genreTags: { ...(input?.genreTags ?? {}) },
    favoritePresetIds: { ...(input?.favoritePresetIds ?? {}) },
    acceptedSuggestionKinds: { ...(input?.acceptedSuggestionKinds ?? {}) },
    rejectedSuggestionKinds: { ...(input?.rejectedSuggestionKinds ?? {}) },
    recurringVocalProblems: { ...(input?.recurringVocalProblems ?? {}) },
    recurringMixProblems: { ...(input?.recurringMixProblems ?? {}) },
    workflowHabits: { ...(input?.workflowHabits ?? {}) },
    exportTargets: { ...(input?.exportTargets ?? {}) },
    favoriteBpmRanges: { ...(input?.favoriteBpmRanges ?? {}) },
    favoriteVocalChains: { ...(input?.favoriteVocalChains ?? {}) },
    favoriteArrangementStructures: { ...(input?.favoriteArrangementStructures ?? {}) },
    favoriteFxUsage: { ...(input?.favoriteFxUsage ?? {}) },
    commonMistakes: { ...(input?.commonMistakes ?? {}) },
    preferredMixStyle: { ...(input?.preferredMixStyle ?? {}) },
    preferredMasterStyle: { ...(input?.preferredMasterStyle ?? {}) },
    lastWorkflowIntent: input?.lastWorkflowIntent,
    updatedAt: input?.updatedAt ?? Date.now(),
  };
}

function mixMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

function stereoMetrics(buffer: AudioBuffer) {
  if (buffer.numberOfChannels < 2) return { correlation: 1, width: 0, monoRisk: 0 };
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  let lr = 0, ll = 0, rr = 0, side = 0, mid = 0;
  const step = Math.max(1, Math.floor(buffer.sampleRate / 12000));
  for (let i = 0; i < buffer.length; i += step) {
    lr += l[i] * r[i];
    ll += l[i] * l[i];
    rr += r[i] * r[i];
    const m = (l[i] + r[i]) * 0.5;
    const s = (l[i] - r[i]) * 0.5;
    mid += m * m;
    side += s * s;
  }
  const correlation = lr / Math.sqrt(Math.max(1e-9, ll * rr));
  const width = Math.sqrt(side / Math.max(1e-9, mid));
  return { correlation, width, monoRisk: clamp((0.25 - correlation) * 160 + Math.max(0, width - 0.85) * 45) };
}

function timingMetrics(buffer: AudioBuffer, tempo: number, clipStartSec: number) {
  const mono = mixMono(buffer);
  const fs = buffer.sampleRate;
  const hop = Math.max(64, Math.floor(fs * 0.01));
  const win = hop * 2;
  const beat = 60 / Math.max(40, tempo);
  const onsets: number[] = [];
  let prev = 0;
  let transientSum = 0;
  for (let i = 0; i < mono.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(mono.length, i + win); j++) e += mono[j] * mono[j];
    e = Math.sqrt(e / win);
    const attack = e - prev;
    if (e > 0.035 && e > prev * 1.5) {
      onsets.push(i / fs);
      transientSum += Math.max(0, attack);
    }
    prev = e * 0.96 + prev * 0.04;
  }
  let dev = 0;
  for (const t of onsets) {
    const absolute = clipStartSec + t;
    const grid = Math.round(absolute / (beat / 4)) * (beat / 4);
    dev += Math.abs(absolute - grid);
  }
  const averageGridOffsetMs = onsets.length ? (dev / onsets.length) * 1000 : 0;
  return {
    onsetCount: onsets.length,
    averageGridOffsetMs,
    tightness: onsets.length < 2 ? 72 : clamp(100 - averageGridOffsetMs * 2.6),
    densityPerSecond: onsets.length / Math.max(0.1, buffer.duration),
    averageAttack: onsets.length ? transientSum / onsets.length : 0,
  };
}

function phraseAndVocalMetrics(buffer: AudioBuffer, analysis: ClipAnalysis) {
  const mono = mixMono(buffer);
  const fs = buffer.sampleRate;
  const hop = Math.max(128, Math.floor(fs * 0.02));
  const rms: number[] = [];
  for (let i = 0; i < mono.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(mono.length, i + hop); j++) e += mono[j] * mono[j];
    rms.push(Math.sqrt(e / hop));
  }
  const active = rms.filter((v) => v > 0.018);
  const mean = active.reduce((a, b) => a + b, 0) / Math.max(1, active.length);
  const variance = active.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, active.length);
  const cv = mean > 1e-6 ? Math.sqrt(variance) / mean : 1;
  let phraseCount = 0;
  let inside = false;
  let silence = 0;
  const frameDur = hop / fs;
  for (const v of rms) {
    if (v > 0.025) {
      if (!inside) phraseCount++;
      inside = true;
      silence = 0;
    } else if (inside) {
      silence += frameDur;
      if (silence > 0.28) inside = false;
    }
  }
  const sibilance = clamp((analysis.highRatio - 0.24) * 240);
  const nasal = clamp((analysis.midRatio - 0.58) * 185);
  const thin = clamp((0.23 - analysis.lowRatio) * 260 + (analysis.highRatio - 0.36) * 60);
  return {
    phraseCount,
    consistency: clamp(100 - cv * 105),
    intelligibility: clamp(100 - sibilance * 0.35 - nasal * 0.28 - (analysis.guesses.boomy ? 15 : 0) - (analysis.guesses.dull ? 12 : 0)),
    sibilance,
    nasal,
    thin,
    emotionalEnergy: clamp(scoreFromDbDistance(analysis.rmsDb, -17, 4) * 0.55 + Math.min(45, phraseCount * 8)),
  };
}

function pitchMetrics(buffer: AudioBuffer, key: number, scale: ScaleId) {
  const frames = detectPitchTrack(buffer, {
    key,
    scale,
    strength: 1,
    speed: 1,
    humanize: 0,
    formantPreserve: false,
  });
  const voiced = frames.filter((f) => f.midi != null && f.targetMidi != null);
  if (!voiced.length) return undefined;
  let cents = 0;
  let drift = 0;
  let vib = 0;
  const hist = new Array(12).fill(0) as number[];
  for (let i = 0; i < voiced.length; i++) {
    const f = voiced[i];
    cents += Math.abs((f.midi! - f.targetMidi!) * 100);
    hist[Math.round(f.midi!) % 12]++;
    if (i > 0) {
      const d = Math.abs((voiced[i].midi! - voiced[i - 1].midi!) * 100);
      drift += d;
      if (d > 12 && d < 95) vib += d;
    }
  }
  const bestKey = hist.indexOf(Math.max(...hist));
  return {
    voicedPct: voiced.length / Math.max(1, frames.length),
    averageCentsError: cents / voiced.length,
    driftCents: drift / Math.max(1, voiced.length - 1),
    vibratoCents: vib / Math.max(1, voiced.length - 1),
    detectedKey: KEY_NAMES[bestKey] ?? KEY_NAMES[key],
  };
}

function roleOf(track: Track): TrackIntelligence["role"] {
  const name = track.name.toLowerCase();
  if (name.includes("vocal") || name.includes("vox") || name.includes("rap") || track.busId === "vocals") return "vocal";
  if (name.includes("drum") || name.includes("kick") || track.busId === "drums") return "drums";
  if (name.includes("bass")) return "bass";
  if (track.busId === "music" || track.instrument) return "music";
  return "unknown";
}

async function analyzeClips(project: Project, getBuffer: (id: string) => AudioBuffer | undefined) {
  const clips: ClipIntelligence[] = [];
  for (const clip of project.clips) {
    if (clip.kind !== "audio" || clip.muted) continue;
    const buffer = getBuffer(clip.assetId);
    if (!buffer) continue;
    const analysis = analyzeBuffer(buffer);
    const timing = timingMetrics(buffer, project.tempo, clip.startSec);
    const vocal = phraseAndVocalMetrics(buffer, analysis);
    const stereo = stereoMetrics(buffer);
    const track = project.tracks.find((t) => t.id === clip.trackId);
    const maybePitch = roleOf(track ?? ({} as Track)) === "vocal"
      ? pitchMetrics(buffer, 0, "major")
      : undefined;
    clips.push({
      clipId: clip.id,
      trackId: clip.trackId,
      name: clip.name,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      analysis,
      pitch: maybePitch,
      timing: {
        onsetCount: timing.onsetCount,
        averageGridOffsetMs: timing.averageGridOffsetMs,
        tightness: timing.tightness,
      },
      vocal,
      stereo,
      transient: {
        densityPerSecond: timing.densityPerSecond,
        averageAttack: timing.averageAttack,
      },
    });
  }
  return clips;
}

function analyzeArrangement(project: Project, clips: ClipIntelligence[]): ArrangementSection[] {
  const sortedMarkers = [...project.markers]
    .filter((m) => m.kind === "section")
    .sort((a, b) => a.timeSec - b.timeSec);
  const points = sortedMarkers.length
    ? sortedMarkers.map((m) => ({ name: m.name, time: m.timeSec }))
    : Array.from({ length: Math.max(1, Math.ceil(project.lengthSec / 16)) }, (_, i) => ({
        name: i === 0 ? "Intro" : `Section ${i + 1}`,
        time: i * 16,
      }));
  return points.map((p, i) => {
    const endSec = points[i + 1]?.time ?? project.lengthSec;
    const sectionClips = clips.filter((c) => c.startSec < endSec && c.startSec + c.durationSec > p.time);
    const duration = Math.max(0.1, endSec - p.time);
    const vocalDensity = sectionClips.reduce((a, c) => a + c.vocal.phraseCount, 0) / duration;
    const midiNotes = project.clips
      .filter((c) => c.kind === "midi" && c.startSec < endSec && c.startSec + c.durationSec > p.time)
      .reduce((a, c) => a + (c.notes?.length ?? 0), 0);
    const energy = clamp(sectionClips.reduce((a, c) => a + c.vocal.emotionalEnergy, 0) / Math.max(1, sectionClips.length));
    const name = p.name.toLowerCase();
    const inferredRole: ArrangementSection["inferredRole"] =
      name.includes("hook") || name.includes("chorus") ? "hook" :
      name.includes("verse") ? "verse" :
      name.includes("bridge") ? "bridge" :
      name.includes("drop") ? "drop" :
      i === 0 ? "intro" :
      i === points.length - 1 ? "outro" :
      energy > 72 ? "hook" : "section";
    return {
      id: `${Math.round(p.time * 1000)}:${i}`,
      name: p.name,
      startSec: p.time,
      endSec,
      energy,
      vocalDensity,
      midiDensity: midiNotes / duration,
      inferredRole,
    };
  });
}

async function analyzeTracks(project: Project, getBuffer: (id: string) => AudioBuffer | undefined) {
  const tracks: TrackIntelligence[] = [];
  for (const track of project.tracks) {
    const clipIds = project.clips.filter((c) => c.trackId === track.id);
    const midiNoteCount = clipIds.reduce((a, c) => a + (c.notes?.length ?? 0), 0);
    const role = roleOf(track);
    const hasAudio = clipIds.some((c) => c.kind === "audio");
    let a: ClipAnalysis | null = null;
    if (hasAudio) {
      try {
        a = analyzeBuffer(await renderStem(project, getBuffer, track.id));
      } catch {
        a = null;
      }
    }
    tracks.push({
      trackId: track.id,
      name: track.name,
      clipCount: clipIds.length,
      audioDurationSec: clipIds.filter((c) => c.kind === "audio").reduce((a, c) => a + c.durationSec, 0),
      midiNoteCount,
      peakDb: a?.peakDb ?? -120,
      rmsDb: a?.rmsDb ?? -120,
      crestDb: a ? a.peakDb - a.rmsDb : 0,
      lowRatio: a?.lowRatio ?? 0,
      midRatio: a?.midRatio ?? 0,
      highRatio: a?.highRatio ?? 0,
      maskingRisk: 0,
      role,
    });
  }
  return tracks;
}

function computeMasking(tracks: TrackIntelligence[]) {
  const out = tracks.map((t) => ({ ...t }));
  const vocals = out.filter((t) => t.role === "vocal" && t.rmsDb > -60);
  for (const vocal of vocals) {
    const blockers = out.filter((t) => t.trackId !== vocal.trackId && t.rmsDb > vocal.rmsDb - 8 && (t.role === "music" || t.role === "drums"));
    vocal.maskingRisk = clamp(blockers.length * 22 + Math.max(0, -18 - vocal.rmsDb) * 2);
  }
  const kickBass = out.filter((t) => (t.role === "drums" || t.role === "bass") && t.rmsDb > -50);
  if (kickBass.length >= 2) {
    for (const t of kickBass) t.maskingRisk = Math.max(t.maskingRisk, 48);
  }
  return out;
}

function computeScores(
  clips: ClipIntelligence[],
  tracks: TrackIntelligence[],
  sections: ArrangementSection[],
  master: StudioIntelligenceSnapshot["master"]
): StudioScores {
  const vocalClips = clips.filter((c) => c.pitch || c.vocal.phraseCount > 0);
  const avg = (values: number[], fallback = 75) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : fallback;
  const pitchAccuracy = avg(vocalClips.map((c) => c.pitch ? clamp(100 - c.pitch.averageCentsError * 1.4 - Math.max(0, c.pitch.driftCents - 55) * 0.35) : 72));
  const timingTightness = avg(clips.map((c) => c.timing.tightness));
  const vocalConsistency = avg(vocalClips.map((c) => c.vocal.consistency));
  const vocalIntelligibility = avg(vocalClips.map((c) => c.vocal.intelligibility));
  const mixClarity = clamp(100 - avg(tracks.map((t) => t.maskingRisk), 0) * 0.75 - tracks.filter((t) => t.peakDb > -0.3).length * 18);
  const tonalBalance = master ? clamp(100 - Math.abs(master.lowRatio - 0.32) * 120 - Math.abs(master.highRatio - 0.22) * 110) : 72;
  const dynamicControl = master ? clamp(100 - Math.max(0, 8 - master.crestDb) * 8 - Math.max(0, master.crestDb - 20) * 3) : 72;
  const stereoBalance = master ? clamp(100 - Math.max(0, master.stereoWidth - 0.9) * 45) : 80;
  const masterReadiness = master ? clamp(100 - (master.peakDb > -0.3 ? 30 : 0) - Math.abs(master.loudnessDb + 14) * 4 - master.clippingPct * 600) : 65;
  const energies = sections.map((s) => s.energy);
  const flowJumps = energies.slice(1).map((e, i) => Math.abs(e - energies[i]));
  const arrangementFlow = clamp(100 - avg(flowJumps, 12) * 1.2 - (sections.length < 3 ? 12 : 0));
  const hooks = sections.filter((s) => s.inferredRole === "hook");
  const verses = sections.filter((s) => s.inferredRole === "verse");
  const hookEnergy = hooks.length ? clamp(avg(hooks.map((s) => s.energy)) - avg(verses.map((s) => s.energy), 50) + 72) : 65;
  const vocalPresence = clamp(vocalIntelligibility * 0.55 + mixClarity * 0.45);
  const beatVocalCompatibility = clamp(timingTightness * 0.55 + (100 - avg(tracks.filter((t) => t.role === "vocal").map((t) => t.maskingRisk), 15)) * 0.45);
  const exportReadiness = clamp(masterReadiness * 0.65 + mixClarity * 0.2 + dynamicControl * 0.15);
  const overall = clamp(
    pitchAccuracy * 0.1 + timingTightness * 0.08 + vocalConsistency * 0.08 + vocalIntelligibility * 0.08 +
    mixClarity * 0.12 + tonalBalance * 0.08 + dynamicControl * 0.08 + stereoBalance * 0.06 +
    masterReadiness * 0.12 + arrangementFlow * 0.07 + vocalPresence * 0.08 + exportReadiness * 0.05
  );
  const roundScores = {
    pitchAccuracy, timingTightness, vocalConsistency, vocalIntelligibility, mixClarity,
    tonalBalance, dynamicControl, stereoBalance, masterReadiness, arrangementFlow,
    hookEnergy, vocalPresence, beatVocalCompatibility, exportReadiness, overall,
  };
  return Object.fromEntries(Object.entries(roundScores).map(([k, v]) => [k, Math.round(v)])) as unknown as StudioScores;
}

function confidence(evidence: IntelligenceEvidence[], strength = 1) {
  return clamp(42 + evidence.length * 16 + strength * 18);
}

function createRecommendations(
  project: Project,
  clips: ClipIntelligence[],
  tracks: TrackIntelligence[],
  sections: ArrangementSection[],
  scores: StudioScores,
  master: StudioIntelligenceSnapshot["master"],
  memory: StudioIntelligenceMemory
): StudioRecommendation[] {
  const recs: StudioRecommendation[] = [];
  const now = Date.now();
  const add = (r: Omit<StudioRecommendation, "id" | "createdAt">) => {
    recs.push({ ...r, id: uid(), createdAt: now });
  };

  for (const c of clips) {
    if (c.analysis.guesses.clipping) {
      add({
        domain: "vocal",
        title: `Repair clipping in ${c.name}`,
        detail: "The waveform reaches the digital ceiling. Lower input/track gain and use safe cleanup before mixing this take.",
        severity: "high",
        confidence: confidence([{ metric: "clippedPct", value: c.analysis.clippedPct, threshold: 0.04, source: c.name }], 1),
        impact: 88,
        urgency: 92,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [{ metric: "clippedPct", value: Number(c.analysis.clippedPct.toFixed(3)), threshold: 0.04, source: c.name }],
        action: { kind: "cleanup-vocal", clipId: c.clipId },
      });
    }
    if (c.pitch && c.pitch.averageCentsError > 28) {
      add({
        domain: "pitch",
        title: `Tune unstable notes in ${c.name}`,
        detail: "Detected notes are drifting away from the nearest scale tones. Use the pitch engine or punch in the worst phrase.",
        severity: c.pitch.averageCentsError > 45 ? "high" : "medium",
        confidence: confidence([
          { metric: "avgCentsError", value: Math.round(c.pitch.averageCentsError), threshold: 28, source: c.name },
          { metric: "voicedPct", value: Number(c.pitch.voicedPct.toFixed(2)), source: c.name },
        ], Math.min(1.5, c.pitch.averageCentsError / 45)),
        impact: 80,
        urgency: 74,
        safeToAutoFix: false,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [
          { metric: "avgCentsError", value: Math.round(c.pitch.averageCentsError), threshold: 28, source: c.name },
          { metric: "driftCents", value: Math.round(c.pitch.driftCents), threshold: 55, source: c.name },
        ],
        action: { kind: "autotune", clipId: c.clipId },
      });
    }
    if (c.timing.averageGridOffsetMs > 45 && c.timing.onsetCount >= 3) {
      add({
        domain: "timing",
        title: `${c.name} is outside the pocket`,
        detail: "Detected vocal attacks are landing far from the grid. Try a punch-in loop or manually nudge the phrase.",
        severity: "medium",
        confidence: confidence([{ metric: "avgGridOffsetMs", value: Math.round(c.timing.averageGridOffsetMs), threshold: 45, source: c.name }], 1),
        impact: 65,
        urgency: 55,
        safeToAutoFix: false,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [{ metric: "avgGridOffsetMs", value: Math.round(c.timing.averageGridOffsetMs), threshold: 45, source: c.name }],
        action: { kind: "add-marker", timeSec: c.startSec, name: "Check vocal timing" },
      });
    }
    if (c.vocal.sibilance > 35 || c.analysis.guesses.harsh) {
      add({
        domain: "fx",
        title: `Use a darker vocal chain on ${c.name}`,
        detail: "High-band energy suggests sibilance or harshness. Avoid bright saturation; use de-essing and a small high shelf cut.",
        severity: "medium",
        confidence: confidence([
          { metric: "highRatio", value: Number(c.analysis.highRatio.toFixed(2)), threshold: 0.34, source: c.name },
          { metric: "sibilance", value: Math.round(c.vocal.sibilance), threshold: 35, source: c.name },
        ], 1),
        impact: 72,
        urgency: 60,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [
          { metric: "highRatio", value: Number(c.analysis.highRatio.toFixed(2)), threshold: 0.34, source: c.name },
          { metric: "sibilance", value: Math.round(c.vocal.sibilance), threshold: 35, source: c.name },
        ],
        action: { kind: "track-preset", trackId: c.trackId, presetId: "intelligent-deharsh-vocal" },
      });
    }
    if (c.vocal.phraseCount > 0 && c.vocal.emotionalEnergy > 66 && c.analysis.highRatio < 0.34) {
      const dryBias = memory.preferredVocalTone.dryness;
      add({
        domain: "fx",
        title: `Add a delay throw after ${c.name}`,
        detail: dryBias > 0.7
          ? "The phrase has enough energy for a small throw, but your history favors drier vocals, so keep it short."
          : "The phrase has enough energy and space for a creative throw at the ending.",
        severity: "low",
        confidence: confidence([
          { metric: "emotionalEnergy", value: Math.round(c.vocal.emotionalEnergy), threshold: 66, source: c.name },
          { metric: "phraseCount", value: c.vocal.phraseCount, source: c.name },
        ], 0.7),
        impact: 45,
        urgency: 28,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [
          { metric: "emotionalEnergy", value: Math.round(c.vocal.emotionalEnergy), threshold: 66, source: c.name },
          { metric: "userDrynessPreference", value: Number(dryBias.toFixed(2)), source: "local memory" },
        ],
        action: { kind: "track-preset", trackId: c.trackId, presetId: "delay-throw-tight" },
      });
    }
  }

  for (const t of tracks) {
    if (t.maskingRisk > 55 && t.role === "vocal") {
      add({
        domain: "mix",
        title: `${t.name} is likely masked`,
        detail: "The vocal stem is close in level to competing music/drum tracks. Bring the vocal forward or carve presence in the beat.",
        severity: "high",
        confidence: confidence([{ metric: "maskingRisk", value: Math.round(t.maskingRisk), threshold: 55, source: t.name }], 1),
        impact: 90,
        urgency: 85,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [{ metric: "maskingRisk", value: Math.round(t.maskingRisk), threshold: 55, source: t.name }],
        action: { kind: "track-preset", trackId: t.trackId, presetId: "bring-vocal-forward" },
      });
    }
    if ((t.role === "drums" || /drum|kick|snare/i.test(t.name)) && t.crestDb > 18 && t.peakDb > -4) {
      add({
        domain: "fx",
        title: `Shape drum punch on ${t.name}`,
        detail: "The drum track has high transient contrast and is close to the ceiling. A punch bus chain can control peaks without flattening the groove.",
        severity: "low",
        confidence: confidence([
          { metric: "crestDb", value: Number(t.crestDb.toFixed(1)), threshold: 18, source: t.name },
          { metric: "peakDb", value: Number(t.peakDb.toFixed(1)), threshold: -4, source: t.name },
        ], 0.8),
        impact: 52,
        urgency: 38,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [
          { metric: "crestDb", value: Number(t.crestDb.toFixed(1)), threshold: 18, source: t.name },
          { metric: "peakDb", value: Number(t.peakDb.toFixed(1)), threshold: -4, source: t.name },
        ],
        action: { kind: "track-preset", trackId: t.trackId, presetId: "drum-punch-bus" },
      });
    }
    if ((t.role === "bass" || /808|bass/i.test(t.name)) && (t.lowRatio > 0.52 || t.maskingRisk > 40)) {
      add({
        domain: "mix",
        title: `Clean low-end on ${t.name}`,
        detail: "Low-band energy is dominating this track. Bass cleanup improves translation and leaves more room for vocal and kick.",
        severity: "medium",
        confidence: confidence([{ metric: "lowRatio", value: Number(t.lowRatio.toFixed(2)), threshold: 0.52, source: t.name }], 0.9),
        impact: 68,
        urgency: 56,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [{ metric: "lowRatio", value: Number(t.lowRatio.toFixed(2)), threshold: 0.52, source: t.name }],
        action: { kind: "track-preset", trackId: t.trackId, presetId: "bass-808-control" },
      });
    }
    if (t.role === "music" && t.midRatio > 0.58 && tracks.some((x) => x.role === "vocal")) {
      add({
        domain: "mix",
        title: `Carve space in ${t.name}`,
        detail: "This instrumental track has strong midrange energy where vocals need intelligibility. Apply a cleanup chain or lower the part during lead lines.",
        severity: "low",
        confidence: confidence([{ metric: "midRatio", value: Number(t.midRatio.toFixed(2)), threshold: 0.58, source: t.name }], 0.7),
        impact: 55,
        urgency: 42,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [{ metric: "midRatio", value: Number(t.midRatio.toFixed(2)), threshold: 0.58, source: t.name }],
        action: { kind: "track-preset", trackId: t.trackId, presetId: "music-bus-cleanup" },
      });
    }
  }

  if (scores.mixClarity < 70) {
    add({
      domain: "mix",
      title: "Run auto gain staging",
      detail: "The mix has low clarity/headroom risk. Gain staging gives every track safer headroom before mastering.",
      severity: "medium",
      confidence: confidence([{ metric: "mixClarity", value: scores.mixClarity, threshold: 70, source: "mix score" }], 1),
      impact: 78,
      urgency: 72,
      safeToAutoFix: true,
      requiresApproval: true,
      informationalOnly: false,
      evidence: [{ metric: "mixClarity", value: scores.mixClarity, threshold: 70, source: "mix score" }],
      action: { kind: "auto-gain-stage" },
    });
  }
  if (master && (master.peakDb > -0.3 || master.clippingPct > 0.0004)) {
    add({
      domain: "master",
      title: "Limiter protection before export",
      detail: "The master is too close to digital clipping. Apply a streaming-safe master target before exporting.",
      severity: "high",
      confidence: confidence([
        { metric: "peakDb", value: Number(master.peakDb.toFixed(1)), threshold: -0.3, source: "master bus" },
        { metric: "clippingPct", value: Number(master.clippingPct.toFixed(4)), source: "master bus" },
      ], 1.2),
      impact: 92,
      urgency: 94,
      safeToAutoFix: true,
      requiresApproval: true,
      informationalOnly: false,
      evidence: [
        { metric: "peakDb", value: Number(master.peakDb.toFixed(1)), threshold: -0.3, source: "master bus" },
        { metric: "clippingPct", value: Number(master.clippingPct.toFixed(4)), source: "master bus" },
      ],
      action: { kind: "master-target", target: "spotify" },
    });
  }
  if (master && (master.stereoWidth > 1.05 || project.monoBelowHz === 0)) {
    add({
      domain: "master",
      title: "Tighten mono translation",
      detail: "The stereo field or low end may not translate cleanly to mono playback. Keep the low end centered.",
      severity: master.stereoWidth > 1.25 ? "medium" : "low",
      confidence: confidence([{ metric: "stereoWidth", value: Number(master.stereoWidth.toFixed(2)), threshold: 1.05, source: "master bus" }], 0.8),
      impact: 58,
      urgency: 45,
      safeToAutoFix: true,
      requiresApproval: true,
      informationalOnly: false,
      evidence: [
        { metric: "stereoWidth", value: Number(master.stereoWidth.toFixed(2)), threshold: 1.05, source: "master bus" },
        { metric: "monoBelowHz", value: project.monoBelowHz ?? 0, threshold: 100, source: "project master" },
      ],
      action: { kind: "stereo-width", value: Math.min(project.stereoWidth ?? 1, 0.95), monoBelowHz: 120 },
    });
  }
  const hooks = sections.filter((s) => s.inferredRole === "hook");
  const verses = sections.filter((s) => s.inferredRole === "verse");
  if (hooks.length && verses.length && Math.max(...hooks.map((s) => s.energy)) <= Math.max(...verses.map((s) => s.energy)) + 4) {
    const hook = hooks[0];
    add({
      domain: "arrangement",
      title: "Hook energy is not lifting enough",
      detail: "The detected hook does not rise above the verse energy. Add a double, harmony, wider chorus, or transition.",
      severity: "medium",
      confidence: confidence([
        { metric: "hookEnergy", value: Math.round(hook.energy), source: hook.name },
        { metric: "arrangementFlow", value: scores.arrangementFlow, source: "section map" },
      ], 0.9),
      impact: 70,
      urgency: 54,
      safeToAutoFix: false,
      requiresApproval: true,
      informationalOnly: false,
      evidence: [
        { metric: "hookEnergy", value: Math.round(hook.energy), source: hook.name },
        { metric: "verseEnergy", value: Math.round(Math.max(...verses.map((s) => s.energy))), source: "verse sections" },
      ],
      action: { kind: "add-marker", timeSec: hook.startSec, name: "Lift hook energy" },
    });
  }
  for (const hook of hooks) {
    const hookVocal = clips.find((c) => c.startSec < hook.endSec && c.startSec + c.durationSec > hook.startSec && c.vocal.phraseCount > 0);
    if (hookVocal && hook.energy > 58 && scores.hookEnergy < 82) {
      add({
        domain: "arrangement",
        title: "Widen the hook vocal stack",
        detail: "The hook has enough measured vocal energy to support a wider double or harmony layer without overcrowding the verse.",
        severity: "low",
        confidence: confidence([
          { metric: "hookEnergy", value: Math.round(hook.energy), threshold: 58, source: hook.name },
          { metric: "hookEnergyScore", value: scores.hookEnergy, threshold: 82, source: "score" },
        ], 0.75),
        impact: 60,
        urgency: 36,
        safeToAutoFix: true,
        requiresApproval: true,
        informationalOnly: false,
        evidence: [
          { metric: "section", value: hook.name, source: "arrangement map" },
          { metric: "vocalPhraseCount", value: hookVocal.vocal.phraseCount, source: hookVocal.name },
        ],
        action: { kind: "track-preset", trackId: hookVocal.trackId, presetId: "wide-hook-double" },
      });
      break;
    }
  }

  const perf = performanceSnapshot(project, () => undefined);
  if (perf.risk !== "low") {
    add({
      domain: "performance",
      title: "Freeze or bounce heavy tracks",
      detail: "Project complexity is elevated. Freeze tracks with live effects before recording to protect playback and monitoring stability.",
      severity: perf.risk === "high" ? "high" : "medium",
      confidence: confidence([
        { metric: "estimatedComplexity", value: perf.estimatedComplexity, threshold: 120, source: "project" },
        { metric: "liveEffectSlots", value: perf.liveEffectSlots, source: "project" },
      ], perf.risk === "high" ? 1.2 : 0.8),
      impact: 75,
      urgency: perf.risk === "high" ? 88 : 60,
      safeToAutoFix: false,
      requiresApproval: true,
      informationalOnly: false,
      evidence: [
        { metric: "estimatedComplexity", value: perf.estimatedComplexity, threshold: 120, source: "project" },
        { metric: "frozenTracks", value: perf.frozenTracks, source: "project" },
      ],
      action: { kind: "notes", text: "Performance Guardian: freeze/bounce heavy live-FX tracks before recording or exporting." },
    });
  }

  return recs.sort((a, b) => (b.severity === "high" ? 100 : b.urgency + b.impact) - (a.severity === "high" ? 100 : a.urgency + a.impact)).slice(0, 30);
}

function detectProjectKey(clips: ClipIntelligence[]) {
  const hist = new Map<string, number>();
  for (const c of clips) if (c.pitch?.detectedKey) hist.set(c.pitch.detectedKey, (hist.get(c.pitch.detectedKey) ?? 0) + c.durationSec);
  let best = KEY_NAMES[0];
  let value = 0;
  for (const [k, v] of hist) if (v > value) { best = k; value = v; }
  return best;
}

function performanceSnapshot(project: Project, getBuffer: (id: string) => AudioBuffer | undefined) {
  const liveEffectSlots = project.tracks.reduce((a, t) => a + Object.values(t.effects).filter((e) => e.enabled).length, 0);
  const decodedAssets = project.assets.filter((a) => getBuffer(a.id)).length;
  const frozenTracks = project.tracks.filter((t) => !!t.frozen).length;
  const estimatedComplexity = liveEffectSlots * 4 + decodedAssets * 2 + project.clips.length + project.tracks.length * 3;
  return {
    frozenTracks,
    liveEffectSlots,
    decodedAssets,
    estimatedComplexity,
    risk: estimatedComplexity > 220 ? "high" as const : estimatedComplexity > 120 ? "medium" as const : "low" as const,
  };
}

export async function analyzeStudioIntelligence(
  project: Project,
  getBuffer: (id: string) => AudioBuffer | undefined,
  memoryInput?: Partial<StudioIntelligenceMemory>
): Promise<StudioIntelligenceSnapshot> {
  const memory = normalizeStudioMemory(memoryInput);
  const clips = await analyzeClips(project, getBuffer);
  let tracks = await analyzeTracks(project, getBuffer);
  tracks = computeMasking(tracks);
  const sections = analyzeArrangement(project, clips);
  let master: StudioIntelligenceSnapshot["master"] = null;
  try {
    const mix = await renderMixdown(project, getBuffer);
    const a = analyzeBuffer(mix);
    const stereo = stereoMetrics(mix);
    master = {
      peakDb: a.peakDb,
      rmsDb: a.rmsDb,
      loudnessDb: a.loudnessDb,
      crestDb: a.peakDb - a.rmsDb,
      clippingPct: a.clippedPct,
      lowRatio: a.lowRatio,
      midRatio: a.midRatio,
      highRatio: a.highRatio,
      stereoWidth: stereo.width,
      monoBelowHz: project.monoBelowHz ?? 0,
    };
  } catch {
    master = null;
  }
  const scores = computeScores(clips, tracks, sections, master);
  const recommendations = createRecommendations(project, clips, tracks, sections, scores, master, memory);
  return {
    id: uid(),
    createdAt: Date.now(),
    projectId: project.id,
    projectName: project.name,
    analyzerVersion: ANALYZER_VERSION,
    durationSec: project.lengthSec,
    trackCount: project.tracks.length,
    clipCount: project.clips.length,
    keyEstimate: detectProjectKey(clips),
    scaleEstimate: SCALES.major.name,
    scores,
    clips,
    tracks,
    sections,
    recommendations,
    master,
    performance: performanceSnapshot(project, getBuffer),
  };
}

function presetBase(): EffectsState {
  return defaultEffects();
}

export const STUDIO_FACTORY_PRESETS: FactoryPreset[] = [
  {
    id: "bring-vocal-forward",
    name: "Bring Vocal Forward",
    category: "vocal",
    intendedUse: "Recover vocal presence when the beat masks the 2-4 kHz intelligibility range.",
    genreTags: ["rap", "pop", "rnb"],
    intensity: "medium",
    wetDry: 0.22,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 95, lowGain: -1.5, midGain: 2.8, midFreq: 2800, midQ: 0.8, highGain: 1.8, highFreq: 10500 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -23, ratio: 3.2, attack: 0.006, release: 0.14, makeup: 2.5 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6800, threshold: -29, ratio: 4.5 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1 };
      return e;
    },
  },
  {
    id: "intelligent-deharsh-vocal",
    name: "De-Harsh Vocal",
    category: "vocal",
    intendedUse: "Sibilant or brittle takes that should stay present without bright saturation.",
    genreTags: ["pop", "rap", "podcast"],
    intensity: "medium",
    wetDry: 0.18,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 90, midGain: -2.5, midFreq: 3600, midQ: 1.2, highGain: -1.8, highFreq: 8800 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6700, threshold: -32, ratio: 6 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -22, ratio: 2.6, attack: 0.01, release: 0.18, makeup: 1.5 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "delay-throw-tight",
    name: "Tight Delay Throw",
    category: "creative",
    intendedUse: "Short end-of-line echo for hook tails and ad-libs without washing out the lead.",
    genreTags: ["rap", "pop", "rnb"],
    intensity: "subtle",
    wetDry: 0.16,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 110, highGain: -1, highFreq: 8500 };
      e.delay = { ...e.delay, enabled: true, time: 0.25, feedback: 0.32, tone: 3600, mix: 0.22 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.36, decay: 0.32, preDelay: 0.015, mix: 0.08 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5 };
      return e;
    },
  },
  {
    id: "telephone-adlib",
    name: "Telephone Ad-lib",
    category: "adlib",
    intendedUse: "Narrow-band filtered ad-libs that sit behind the lead vocal.",
    genreTags: ["rap", "pop", "creative"],
    intensity: "bold",
    wetDry: 0.45,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 450, lowGain: -8, midGain: 4, midFreq: 1800, midQ: 1.5, highGain: -9, highFreq: 4200 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -25, ratio: 5, attack: 0.004, release: 0.11, makeup: 4 };
      e.saturation = { ...e.saturation, enabled: true, drive: 6, mix: 0.38 };
      e.delay = { ...e.delay, enabled: true, time: 0.18, feedback: 0.22, tone: 2600, mix: 0.16 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1 };
      return e;
    },
  },
  {
    id: "wide-hook-double",
    name: "Wide Hook Double",
    category: "double",
    intendedUse: "Chorus doubles and stacked hook layers that need width without losing mono focus.",
    genreTags: ["pop", "rnb", "rap"],
    intensity: "medium",
    wetDry: 0.3,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 120, lowGain: -2, midGain: 0.8, midFreq: 2400, highGain: 1.8, highFreq: 10000 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 8, rate: 1.1, spread: 0.72, mix: 0.34 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -24, ratio: 3, attack: 0.008, release: 0.17, makeup: 2 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.42, decay: 0.42, mix: 0.13 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "intimate-verse",
    name: "Intimate Verse",
    category: "vocal",
    intendedUse: "Dry, close vocal tone for lower-energy verse sections.",
    genreTags: ["rnb", "pop", "podcast"],
    intensity: "subtle",
    wetDry: 0.08,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 75, lowGain: 1.2, lowFreq: 180, midGain: 1, midFreq: 2200, highGain: 0.7, highFreq: 9500 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -21, ratio: 2.4, attack: 0.014, release: 0.22, makeup: 2 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6200, threshold: -31, ratio: 3.5 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.22, decay: 0.24, mix: 0.07 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.4 };
      return e;
    },
  },
  {
    id: "streaming-master-safe",
    name: "Streaming Master Safe",
    category: "master",
    intendedUse: "Conservative master chain for streaming exports with limiter protection.",
    genreTags: ["spotify", "youtube", "apple", "tiktok"],
    intensity: "medium",
    wetDry: 1,
    routing: "master",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 28, lowGain: -0.8, lowFreq: 130, midGain: 0.5, midFreq: 2500, highGain: 0.8, highFreq: 11000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -18, ratio: 1.8, attack: 0.025, release: 0.28, makeup: 1 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1, release: 0.06 };
      return e;
    },
  },
  {
    id: "rap-lead-chain",
    name: "Rap Lead Chain",
    category: "rap",
    intendedUse: "Upfront rap lead with tight gate, firm compression, presence, and controlled sibilance.",
    genreTags: ["rap", "trap", "drill"],
    intensity: "bold",
    wetDry: 0.2,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.gate = { ...e.gate, enabled: true, threshold: -45, release: 0.1 };
      e.eq = { ...e.eq, enabled: true, hpf: 105, lowGain: -1.5, midGain: 3, midFreq: 2300, highGain: 2, highFreq: 9800 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 7000, threshold: -28, ratio: 5.5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -25, ratio: 5, attack: 0.004, release: 0.11, makeup: 5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 5, mix: 0.28 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.9 };
      return e;
    },
  },
  {
    id: "rnb-silk-chain",
    name: "R&B Silk Chain",
    category: "rnb",
    intendedUse: "Smooth vocal tone for melodic R&B: warm low-mid body, soft top, and plate space.",
    genreTags: ["rnb", "soul", "pop"],
    intensity: "medium",
    wetDry: 0.24,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 75, lowGain: 1.2, lowFreq: 190, midGain: -1, midFreq: 850, highGain: 2.4, highFreq: 10800 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 6400, threshold: -31, ratio: 4 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -23, ratio: 2.5, attack: 0.014, release: 0.24, makeup: 3 };
      e.delay = { ...e.delay, enabled: true, time: 0.34, feedback: 0.25, tone: 3200, mix: 0.12 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.52, decay: 0.5, preDelay: 0.018, mix: 0.22 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "podcast-clarity",
    name: "Podcast Clarity",
    category: "podcast",
    intendedUse: "Spoken vocal cleanup with low rumble removal, intelligibility lift, de-ess, and limiter safety.",
    genreTags: ["podcast", "voiceover"],
    intensity: "medium",
    wetDry: 0.12,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.gate = { ...e.gate, enabled: true, threshold: -49, release: 0.16 };
      e.eq = { ...e.eq, enabled: true, hpf: 85, lowGain: 1.5, lowFreq: 170, midGain: 1.8, midFreq: 2600, highGain: 1, highFreq: 8500 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 5900, threshold: -30, ratio: 4.5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -20, ratio: 3.2, attack: 0.012, release: 0.2, makeup: 3.5 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5, release: 0.08 };
      return e;
    },
  },
  {
    id: "lofi-radio-voice",
    name: "Lo-fi Radio Voice",
    category: "creative",
    intendedUse: "Dark, compressed, narrow vocal for contrast sections, phone lines, and bridge moments.",
    genreTags: ["creative", "rap", "indie"],
    intensity: "bold",
    wetDry: 0.5,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 360, lowGain: -8, midGain: 4.5, midFreq: 1700, midQ: 1.4, highGain: -7, highFreq: 4700 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -28, ratio: 6, attack: 0.004, release: 0.12, makeup: 5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 9, mix: 0.45 };
      e.delay = { ...e.delay, enabled: true, time: 0.16, feedback: 0.18, tone: 2200, mix: 0.1 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "reverb-throw-plate",
    name: "Reverb Throw Plate",
    category: "creative",
    intendedUse: "One-line plate throw for transitions and emotional phrase endings.",
    genreTags: ["pop", "rnb", "creative"],
    intensity: "medium",
    wetDry: 0.32,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 180, highGain: -1.5, highFreq: 7600 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.78, decay: 0.72, preDelay: 0.035, mix: 0.42 };
      e.delay = { ...e.delay, enabled: true, time: 0.38, feedback: 0.18, tone: 3100, mix: 0.08 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.8 };
      return e;
    },
  },
  {
    id: "bridge-washout",
    name: "Bridge Washout",
    category: "creative",
    intendedUse: "Washed background bridge effect with filtered vocal, long ambience, and soft saturation.",
    genreTags: ["bridge", "pop", "rnb"],
    intensity: "bold",
    wetDry: 0.55,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 210, lowGain: -4, midGain: -1, midFreq: 1200, highGain: -3.5, highFreq: 6500 };
      e.saturation = { ...e.saturation, enabled: true, drive: 4, mix: 0.22 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 10, rate: 0.7, spread: 0.84, mix: 0.38 };
      e.delay = { ...e.delay, enabled: true, time: 0.48, feedback: 0.42, tone: 2600, mix: 0.22 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.82, decay: 0.78, preDelay: 0.025, mix: 0.34 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.8 };
      return e;
    },
  },
  {
    id: "drum-punch-bus",
    name: "Drum Punch Bus",
    category: "drums",
    intendedUse: "Punchier drums with low cleanup, transient-friendly compression, and light saturation.",
    genreTags: ["drums", "trap", "pop"],
    intensity: "medium",
    wetDry: 0.18,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 32, lowGain: 1.6, lowFreq: 90, midGain: -1.5, midFreq: 420, highGain: 1.5, highFreq: 8200 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -18, ratio: 2.6, attack: 0.018, release: 0.12, makeup: 1.5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 3.5, mix: 0.2 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.8 };
      return e;
    },
  },
  {
    id: "bass-808-control",
    name: "808/Bass Control",
    category: "bass",
    intendedUse: "Cleaner bass translation with low-end focus, reduced mud, compression, and limiter protection.",
    genreTags: ["bass", "808", "trap"],
    intensity: "medium",
    wetDry: 0.16,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 25, lowGain: 2.2, lowFreq: 70, midGain: -2.8, midFreq: 260, highGain: -2, highFreq: 5200 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -20, ratio: 3.5, attack: 0.018, release: 0.18, makeup: 2 };
      e.saturation = { ...e.saturation, enabled: true, drive: 4.5, mix: 0.18 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1 };
      return e;
    },
  },
  {
    id: "synth-polish",
    name: "Synth Polish",
    category: "synth",
    intendedUse: "Clean synth presence with less low-mid buildup and a controlled stereo lift.",
    genreTags: ["synth", "pop", "electronic"],
    intensity: "subtle",
    wetDry: 0.18,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 95, lowGain: -2, midGain: -1, midFreq: 500, highGain: 1.8, highFreq: 9400 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -19, ratio: 1.8, attack: 0.02, release: 0.22, makeup: 1 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 5, rate: 0.6, spread: 0.5, mix: 0.16 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5 };
      return e;
    },
  },
  {
    id: "music-bus-cleanup",
    name: "Music Bus Cleanup",
    category: "instrument",
    intendedUse: "Carve instrumental-track mud and leave space for a vocal-forward mix.",
    genreTags: ["music", "mix", "vocal-forward"],
    intensity: "subtle",
    wetDry: 0.14,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 35, lowGain: -1.6, lowFreq: 180, midGain: -1.8, midFreq: 650, highGain: 0.8, highFreq: 9800 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -17, ratio: 1.6, attack: 0.025, release: 0.3, makeup: 0.8 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "double-wide",
    name: "Double Wide",
    category: "double",
    intendedUse: "Wide double-track chain for supporting a lead without crowding the center.",
    genreTags: ["double", "vocal", "hook"],
    intensity: "medium",
    wetDry: 0.34,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 135, lowGain: -2.5, midGain: 0.6, midFreq: 2500, highGain: 1.3, highFreq: 9800 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -24, ratio: 3, attack: 0.009, release: 0.17, makeup: 2 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 9, rate: 0.95, spread: 0.86, mix: 0.42 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.38, decay: 0.34, mix: 0.12 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.3 };
      return e;
    },
  },
  {
    id: "adlib-space",
    name: "Ad-lib Space",
    category: "adlib",
    intendedUse: "Tucked ad-lib chain with filtered tone, throws, width, and less lead-vocal masking.",
    genreTags: ["adlib", "rap", "creative"],
    intensity: "medium",
    wetDry: 0.36,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 190, lowGain: -4.5, midGain: 1.5, midFreq: 2700, highGain: -2.5, highFreq: 7600 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -26, ratio: 4.2, attack: 0.006, release: 0.13, makeup: 3 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 8, rate: 1.4, spread: 0.74, mix: 0.32 };
      e.delay = { ...e.delay, enabled: true, time: 0.2, feedback: 0.34, tone: 2800, mix: 0.24 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.5, decay: 0.44, mix: 0.18 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.5 };
      return e;
    },
  },
  {
    id: "pop-lead-gloss",
    name: "Pop Lead Gloss",
    category: "pop",
    intendedUse: "Glossy modern pop lead with controlled air, de-essing, and short ambience.",
    genreTags: ["pop", "lead vocal", "bright"],
    intensity: "medium",
    wetDry: 0.2,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 95, lowGain: -1, midGain: 1.8, midFreq: 3100, highGain: 3.4, highFreq: 11500 };
      e.deEsser = { ...e.deEsser, enabled: true, freq: 7100, threshold: -29, ratio: 5 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -23, ratio: 3.1, attack: 0.007, release: 0.15, makeup: 3.5 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.42, decay: 0.36, preDelay: 0.02, mix: 0.15 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.9 };
      return e;
    },
  },
  {
    id: "distorted-adlib",
    name: "Distorted Ad-lib",
    category: "adlib",
    intendedUse: "Aggressive saturated ad-lib or hype layer that cuts without becoming the lead.",
    genreTags: ["adlib", "distortion", "rap"],
    intensity: "bold",
    wetDry: 0.58,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 240, lowGain: -6, midGain: 3.8, midFreq: 1800, midQ: 1.2, highGain: -1.5, highFreq: 7000 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -29, ratio: 6, attack: 0.003, release: 0.1, makeup: 5 };
      e.saturation = { ...e.saturation, enabled: true, drive: 13, mix: 0.62 };
      e.delay = { ...e.delay, enabled: true, time: 0.16, feedback: 0.26, tone: 2300, mix: 0.15 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "reverse-reverb-approx",
    name: "Reverse Reverb Approx",
    category: "creative",
    intendedUse: "Pre-delay-heavy wash that approximates a reverse-reverb lead-in for transitions.",
    genreTags: ["reverse reverb", "transition", "creative"],
    intensity: "bold",
    wetDry: 0.52,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 220, lowGain: -4, midGain: -0.5, midFreq: 900, highGain: -1.8, highFreq: 6800 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 12, rate: 0.45, spread: 0.8, mix: 0.28 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.9, decay: 0.86, preDelay: 0.12, mix: 0.56 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.8 };
      return e;
    },
  },
  {
    id: "tape-stop-approx",
    name: "Tape Stop Approx",
    category: "creative",
    intendedUse: "Dark saturated transition tone for clips that will be bounced or faded into a stop.",
    genreTags: ["tape stop", "transition", "dark"],
    intensity: "bold",
    wetDry: 0.48,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 55, lowGain: 2.6, lowFreq: 130, midGain: -3.2, midFreq: 850, highGain: -8, highFreq: 4300 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -25, ratio: 4.5, attack: 0.01, release: 0.26, makeup: 3 };
      e.saturation = { ...e.saturation, enabled: true, drive: 10, mix: 0.44 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.34, decay: 0.32, mix: 0.1 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.4 };
      return e;
    },
  },
  {
    id: "stutter-edit-tone",
    name: "Stutter Edit Tone",
    category: "creative",
    intendedUse: "Tight gated-delay tone for chopped words, stutter edits, and rhythmic vocal fills.",
    genreTags: ["stutter", "vocal chop", "creative"],
    intensity: "medium",
    wetDry: 0.34,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.gate = { ...e.gate, enabled: true, threshold: -42, attack: 0.002, release: 0.045, floor: 0.04 };
      e.eq = { ...e.eq, enabled: true, hpf: 160, lowGain: -4, midGain: 2.5, midFreq: 2100, highGain: -2, highFreq: 7200 };
      e.delay = { ...e.delay, enabled: true, time: 0.115, feedback: 0.18, tone: 2600, mix: 0.28 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.2 };
      return e;
    },
  },
  {
    id: "hook-widener-lift",
    name: "Hook Widener Lift",
    category: "creative",
    intendedUse: "Chorus lift chain with width, light chorus movement, and controlled air.",
    genreTags: ["hook", "widener", "chorus"],
    intensity: "medium",
    wetDry: 0.3,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 105, lowGain: -1.5, midGain: 1.2, midFreq: 2600, highGain: 2.6, highFreq: 10400 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 11, rate: 0.85, spread: 0.88, mix: 0.38 };
      e.delay = { ...e.delay, enabled: true, time: 0.28, feedback: 0.18, tone: 3600, mix: 0.08 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.44, decay: 0.4, mix: 0.13 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1 };
      return e;
    },
  },
  {
    id: "impact-transition",
    name: "Impact Transition",
    category: "creative",
    intendedUse: "Saturated, compressed impact layer for drops and section changes.",
    genreTags: ["impact", "transition", "beatmaking"],
    intensity: "bold",
    wetDry: 0.45,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 35, lowGain: 3.6, lowFreq: 95, midGain: -1.2, midFreq: 500, highGain: 2.1, highFreq: 8500 };
      e.compressor = { ...e.compressor, enabled: true, threshold: -23, ratio: 5.2, attack: 0.002, release: 0.11, makeup: 4 };
      e.saturation = { ...e.saturation, enabled: true, drive: 8, mix: 0.36 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -0.8 };
      return e;
    },
  },
  {
    id: "riser-filter-sweep",
    name: "Riser Filter Sweep",
    category: "creative",
    intendedUse: "Thin bright transition setup for risers and sweep-like moments before automation.",
    genreTags: ["riser", "filter sweep", "transition"],
    intensity: "medium",
    wetDry: 0.35,
    routing: "track",
    build: () => {
      const e = presetBase();
      e.eq = { ...e.eq, enabled: true, hpf: 420, lowGain: -8, midGain: 1.4, midFreq: 3200, highGain: 4.5, highFreq: 9000 };
      e.doubler = { ...e.doubler, enabled: true, depthMs: 14, rate: 1.8, spread: 0.9, mix: 0.34 };
      e.delay = { ...e.delay, enabled: true, time: 0.18, feedback: 0.42, tone: 5400, mix: 0.2 };
      e.reverb = { ...e.reverb, enabled: true, size: 0.76, decay: 0.72, mix: 0.28 };
      e.limiter = { ...e.limiter, enabled: true, threshold: -1.4 };
      return e;
    },
  },
];

export function getFactoryPreset(id: string): FactoryPreset | undefined {
  return STUDIO_FACTORY_PRESETS.find((p) => p.id === id);
}

export function applyMemoryEvent(
  memoryInput: Partial<StudioIntelligenceMemory> | undefined,
  event: { kind: "accepted" | "rejected" | "preset" | "export"; key: string; tone?: Partial<StudioIntelligenceMemory["preferredVocalTone"]> }
): StudioIntelligenceMemory {
  const memory = normalizeStudioMemory(memoryInput);
  const target =
    event.kind === "accepted" ? memory.acceptedSuggestionKinds :
    event.kind === "rejected" ? memory.rejectedSuggestionKinds :
    event.kind === "preset" ? memory.favoritePresetIds :
    memory.exportTargets;
  target[event.key] = (target[event.key] ?? 0) + 1;
  if (event.kind === "preset") {
    memory.favoriteVocalChains[event.key] = (memory.favoriteVocalChains[event.key] ?? 0) + 1;
    const preset = getFactoryPreset(event.key);
    if (preset) {
      memory.preferredMixStyle[preset.category] = (memory.preferredMixStyle[preset.category] ?? 0) + 1;
      for (const tag of preset.genreTags) memory.genreTags[tag] = (memory.genreTags[tag] ?? 0) + 1;
      const fx = preset.build();
      for (const [key, value] of Object.entries(fx)) {
        if ((value as { enabled?: boolean }).enabled) {
          memory.favoriteFxUsage[key] = (memory.favoriteFxUsage[key] ?? 0) + 1;
        }
      }
    }
  }
  if (event.tone) {
    memory.preferredVocalTone = {
      brightness: event.tone.brightness != null ? memory.preferredVocalTone.brightness * 0.7 + event.tone.brightness * 0.3 : memory.preferredVocalTone.brightness,
      dryness: event.tone.dryness != null ? memory.preferredVocalTone.dryness * 0.7 + event.tone.dryness * 0.3 : memory.preferredVocalTone.dryness,
      saturation: event.tone.saturation != null ? memory.preferredVocalTone.saturation * 0.7 + event.tone.saturation * 0.3 : memory.preferredVocalTone.saturation,
      width: event.tone.width != null ? memory.preferredVocalTone.width * 0.7 + event.tone.width * 0.3 : memory.preferredVocalTone.width,
    };
  }
  memory.updatedAt = Date.now();
  return memory;
}

export function midiIdeaFromSection(section: ArrangementSection): MidiNote[] {
  const bar = Math.max(1, (section.endSec - section.startSec) / 4);
  const root = section.inferredRole === "hook" ? 60 : 57;
  return [
    { id: uid(), pitch: root, startSec: 0, durationSec: bar, velocity: 0.72 },
    { id: uid(), pitch: root + 7, startSec: bar, durationSec: bar, velocity: 0.68 },
    { id: uid(), pitch: root + 9, startSec: bar * 2, durationSec: bar, velocity: 0.7 },
    { id: uid(), pitch: root + 5, startSec: bar * 3, durationSec: bar, velocity: 0.66 },
  ];
}
