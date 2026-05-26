import { KEY_NAMES, SCALES, type ScaleId, detectPitchTrack } from "./autotune";
import { analyzeBuffer } from "./autoEnhance";
import type {
  BeatGridMarker,
  BeatIntelligenceAnalysis,
  Clip,
  SongSectionAnalysis,
  VocalTuneAssistReport,
  VocalWarmupDrill,
  VocalWarmupStudioState,
} from "../state/types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

function mixMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

function envelope(mono: Float32Array, sampleRate: number) {
  const hop = Math.max(256, Math.floor(sampleRate * 0.0125));
  const win = hop * 2;
  const values: number[] = [];
  for (let i = 0; i < mono.length; i += hop) {
    let rms = 0;
    for (let j = i; j < Math.min(mono.length, i + win); j++) rms += mono[j] * mono[j];
    values.push(Math.sqrt(rms / win));
  }
  const flux: number[] = [];
  for (let i = 1; i < values.length; i++) flux.push(Math.max(0, values[i] - values[i - 1]));
  return { values, flux, hopSec: hop / sampleRate };
}

function detectOnsets(flux: number[], hopSec: number) {
  const sorted = [...flux].sort((a, b) => a - b);
  const threshold = (sorted[Math.floor(sorted.length * 0.82)] || 0) * 1.1;
  const onsets: number[] = [];
  let last = -1;
  for (let i = 2; i < flux.length - 2; i++) {
    const localPeak = flux[i] > flux[i - 1] && flux[i] >= flux[i + 1];
    if (localPeak && flux[i] > threshold && (last < 0 || (i - last) * hopSec > 0.095)) {
      onsets.push(i * hopSec);
      last = i;
    }
  }
  return onsets;
}

function estimateBpmFromOnsets(onsets: number[]) {
  if (onsets.length < 4) return { bpm: 120, confidence: 0.2 };
  const candidates: Array<{ bpm: number; score: number }> = [];
  for (let bpm = 70; bpm <= 180; bpm++) {
    const beat = 60 / bpm;
    let score = 0;
    for (const onset of onsets) {
      const pos = onset / beat;
      const dist = Math.abs(pos - Math.round(pos));
      score += Math.exp(-Math.pow(dist / 0.12, 2));
    }
    candidates.push({ bpm, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? { bpm: 120, score: 0 };
  const second = candidates.find((c) => Math.abs(c.bpm - best.bpm) > 6) ?? candidates[1] ?? best;
  const confidence = clamp((best.score - second.score * 0.72) / Math.max(1, onsets.length * 0.38), 0.18, 0.96);
  return { bpm: best.bpm, confidence };
}

function findDownbeat(onsets: number[], bpm: number, durationSec: number) {
  const beat = 60 / bpm;
  const maxOffset = Math.min(beat * 4, durationSec);
  let bestOffset = onsets[0] ?? 0;
  let bestScore = -Infinity;
  for (let offset = 0; offset < maxOffset; offset += beat / 8) {
    let score = 0;
    for (const onset of onsets) {
      const beatIndex = Math.round((onset - offset) / beat);
      if (beatIndex < 0) continue;
      const grid = offset + beatIndex * beat;
      const closeness = Math.exp(-Math.pow(Math.abs(onset - grid) / (beat * 0.13), 2));
      score += closeness * (beatIndex % 4 === 0 ? 1.35 : 0.9);
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return Math.max(0, bestOffset);
}

function buildBeatGrid(bpm: number, downbeatSec: number, durationSec: number, onsets: number[]): BeatGridMarker[] {
  const beat = 60 / bpm;
  const grid: BeatGridMarker[] = [];
  for (let t = downbeatSec, i = 0; t <= durationSec + beat; t += beat, i++) {
    const nearest = onsets.reduce((best, onset) => Math.min(best, Math.abs(onset - t)), beat);
    grid.push({
      id: uid(),
      timeSec: t,
      beat: (i % 4) + 1,
      bar: Math.floor(i / 4) + 1,
      downbeat: i % 4 === 0,
      confidence: clamp(1 - nearest / Math.max(0.001, beat * 0.5), 0.25, 1),
    });
  }
  return grid;
}

function energyCurve(envelopeValues: number[], hopSec: number, bucketSec = 4) {
  const perBucket = Math.max(1, Math.round(bucketSec / hopSec));
  const curve: Array<{ timeSec: number; energy: number }> = [];
  const max = Math.max(...envelopeValues, 1e-5);
  for (let i = 0; i < envelopeValues.length; i += perBucket) {
    curve.push({ timeSec: i * hopSec, energy: clamp(mean(envelopeValues.slice(i, i + perBucket)) / max) });
  }
  return curve;
}

function sectionName(index: number, total: number, energy: number): SongSectionAnalysis["name"] {
  if (index === 0) return "Intro";
  if (index === total - 1) return "Outro";
  if (energy > 0.66) return "Hook";
  if (energy < 0.38 && index > total * 0.55) return "Bridge";
  return "Verse";
}

function estimateSections(curve: Array<{ timeSec: number; energy: number }>, durationSec: number): SongSectionAnalysis[] {
  const targetCount = Math.max(3, Math.min(7, Math.round(durationSec / 24)));
  const sectionDur = durationSec / targetCount;
  const sections: SongSectionAnalysis[] = [];
  for (let i = 0; i < targetCount; i++) {
    const start = i * sectionDur;
    const end = i === targetCount - 1 ? durationSec : (i + 1) * sectionDur;
    const local = curve.filter((p) => p.timeSec >= start && p.timeSec < end);
    const energy = clamp(mean(local.map((p) => p.energy)));
    const vocalSpace = clamp(1 - energy * 0.62 + (energy > 0.58 ? 0.16 : 0));
    const name = sectionName(i, targetCount, energy);
    const notes = [
      vocalSpace > 0.62 ? `${name} has room for lead vocals.` : `${name} is dense; keep delivery tighter and simpler.`,
      energy > 0.68 ? "Energy lift detected." : energy < 0.34 ? "Lower-energy pocket detected." : "Medium-energy section.",
    ];
    sections.push({ id: uid(), name, startSec: start, endSec: end, energy, vocalSpace, notes });
  }
  return sections;
}

function estimateKey(buffer: AudioBuffer): { key: string; scale: "major" | "minor" | "unknown"; keyIndex: number } {
  const frames = detectPitchTrack(buffer, { key: 0, scale: "chromatic", strength: 0, speed: 0.5, humanize: 0, formantPreserve: false });
  const hist = new Array(12).fill(0);
  for (const frame of frames) {
    if (frame.midi != null) hist[((Math.round(frame.midi) % 12) + 12) % 12] += 1;
  }
  const maxCount = Math.max(...hist);
  if (maxCount < 3) return { key: "Unknown", scale: "unknown", keyIndex: 0 };
  let bestKey = 0;
  let bestMajor = -Infinity;
  let bestMinor = -Infinity;
  const major = SCALES.major.degrees;
  const minor = SCALES.minor.degrees;
  for (let k = 0; k < 12; k++) {
    const majorScore = major.reduce((sum, d) => sum + hist[(k + d) % 12], 0);
    const minorScore = minor.reduce((sum, d) => sum + hist[(k + d) % 12], 0);
    if (majorScore > bestMajor) {
      bestMajor = majorScore;
      bestKey = k;
    }
    if (minorScore > bestMinor) bestMinor = minorScore;
  }
  const scale = bestMinor > bestMajor * 1.04 ? "minor" : "major";
  if (scale === "minor") {
    let minorKey = 0;
    let score = -Infinity;
    for (let k = 0; k < 12; k++) {
      const s = minor.reduce((sum, d) => sum + hist[(k + d) % 12], 0);
      if (s > score) {
        score = s;
        minorKey = k;
      }
    }
    bestKey = minorKey;
  }
  return { key: KEY_NAMES[bestKey], scale, keyIndex: bestKey };
}

function producerNotes(analysis: ReturnType<typeof analyzeBuffer>, sections: SongSectionAnalysis[], confidence: number) {
  const notes: string[] = [];
  const hooks = sections.filter((s) => s.name === "Hook");
  if (hooks.some((s) => s.vocalSpace > 0.58)) notes.push("This beat has space for vocals in the hook.");
  if (sections.some((s) => s.name === "Verse" && s.energy > 0.58)) notes.push("Verse needs tighter delivery so words do not fight the instrumental.");
  if (analysis.lowRatio > 0.48 || analysis.guesses.boomy) notes.push("Low mids may clash with vocals; use high-pass and a small 250-400 Hz cut.");
  if (analysis.highRatio > 0.34 || analysis.guesses.harsh) notes.push("Top end is busy; de-ess vocals and avoid extra bright air until mix stage.");
  if (confidence < 0.5) notes.push("Tempo confidence is moderate; tap-tempo once while listening to lock the grid.");
  if (notes.length === 0) notes.push("Arrangement is balanced; focus on hook contrast and vocal emotion.");
  return notes;
}

export function analyzeBeatIntelligence(buffer: AudioBuffer, source: { clip?: Clip | null; assetId?: string | null; name: string }): BeatIntelligenceAnalysis {
  const mono = mixMono(buffer);
  const env = envelope(mono, buffer.sampleRate);
  const onsets = detectOnsets(env.flux, env.hopSec);
  const tempo = estimateBpmFromOnsets(onsets);
  const downbeatSec = findDownbeat(onsets, tempo.bpm, buffer.duration);
  const beatGrid = buildBeatGrid(tempo.bpm, downbeatSec, buffer.duration, onsets);
  const curve = energyCurve(env.values, env.hopSec);
  const sections = estimateSections(curve, buffer.duration);
  const key = estimateKey(buffer);
  const tonal = analyzeBuffer(buffer);
  const mood = `${key.scale === "minor" ? "moody / darker" : key.scale === "major" ? "bright / open" : "rhythmic"} ${tonal.lowRatio > 0.45 ? "with heavy low-end weight" : tonal.highRatio > 0.32 ? "with glossy top-end motion" : "with balanced tone"}`;
  return {
    id: uid(),
    createdAt: Date.now(),
    sourceClipId: source.clip?.id ?? null,
    sourceAssetId: source.assetId ?? source.clip?.assetId ?? null,
    sourceName: source.name,
    durationSec: buffer.duration,
    bpm: tempo.bpm,
    confidence: tempo.confidence,
    downbeatSec,
    beatGrid,
    detectedOnsets: onsets.slice(0, 400),
    breakdown: {
      sections,
      energyCurve: curve,
      keyEstimate: key.key,
      scaleEstimate: key.scale,
      chordMood: mood,
      producerNotes: producerNotes(tonal, sections, tempo.confidence),
      limitations: [
        "Chord names are estimated from pitch-class energy, not full polyphonic transcription.",
        "Downbeats use onset strength and bar-position scoring; user tap correction can override project tempo.",
      ],
    },
    live: ["BPM detection", "beat/downbeat grid", "waveform markers", "energy sections", "key/mood estimate", "producer notes"],
    queued: ["full chord transcription", "ML stem-aware vocal-space detection", "elastic audio time-stretch"],
  };
}

export function analyzeVocalTuneAssist(
  buffer: AudioBuffer,
  clip: Clip,
  opts: { projectKey?: string; key: number; scale: ScaleId; tempo: number }
): VocalTuneAssistReport {
  const frames = detectPitchTrack(buffer, { key: opts.key, scale: opts.scale, strength: 1, speed: 0.6, humanize: 0, formantPreserve: true });
  const voiced = frames.filter((f) => f.midi != null && f.targetMidi != null);
  const cents = voiced.map((f) => (f.midi! - f.targetMidi!) * 100);
  const avgCents = mean(cents);
  const avgAbs = mean(cents.map(Math.abs));
  const pitchScore = Math.round(clamp(1 - avgAbs / 90, 0, 1) * 100);
  const analysis = analyzeBuffer(buffer);
  const mono = mixMono(buffer);
  const env = envelope(mono, buffer.sampleRate);
  const vocalOnsets = detectOnsets(env.flux, env.hopSec);
  const beatSec = 60 / Math.max(40, opts.tempo);
  const timingOffset =
    vocalOnsets.length > 1
      ? mean(vocalOnsets.map((onset) => Math.abs(onset - Math.round(onset / (beatSec / 2)) * (beatSec / 2)) / beatSec))
      : 0.22;
  const sharpFlat = Math.abs(avgCents) < 12 ? "centered" : avgCents > 0 ? "sharp" : "flat";
  const timingScore = Math.round(clamp(1 - timingOffset * 3.4, 0.35, 0.94) * 100);
  const breathScore = Math.round(clamp(1 - analysis.highRatio * 0.9, 0.25, 0.95) * 100);
  const deliveryScore = Math.round(clamp(1 - Math.abs(analysis.rmsDb + 18) / 22, 0.25, 0.98) * 100);
  const crestDb = analysis.peakDb - analysis.rmsDb;
  const emotionScore = Math.round(clamp((crestDb - 6) / 15, 0.25, 0.96) * 100);
  const suggestedStrength = clamp(avgAbs / 70, 0.18, 0.92);
  const retakeNotes: string[] = [];
  if (sharpFlat !== "centered") retakeNotes.push(`Pitch trends ${sharpFlat} by about ${Math.abs(Math.round(avgCents))} cents.`);
  if (pitchScore < 70) retakeNotes.push("Retake sustained notes with stronger breath support before leaning on hard tuning.");
  if (timingScore < 62) retakeNotes.push("Words need a tighter pocket; record with the metronome or beat grid visible.");
  if (breathScore < 65) retakeNotes.push("Breath and sibilance are prominent; leave more space before phrases and use de-essing.");
  if (deliveryScore < 65) retakeNotes.push("Delivery level is uneven; move less around the mic or use a level-rider pass.");
  if (emotionScore < 55) retakeNotes.push("Emotion reads restrained; push the key words and relax the filler words.");
  if (retakeNotes.length === 0) retakeNotes.push("Take is tune-ready; use light correction and keep the natural movement.");
  return {
    id: uid(),
    createdAt: Date.now(),
    clipId: clip.id,
    clipName: clip.name,
    detectedKey: opts.projectKey ?? KEY_NAMES[opts.key],
    suggestedKey: opts.key,
    suggestedScale: opts.scale === "minor" ? "minor" : opts.scale === "major" ? "major" : "chromatic",
    averageCents: Math.round(avgCents),
    sharpFlat,
    pitchScore,
    timingScore,
    breathScore,
    deliveryScore,
    emotionScore,
    suggestedAutotuneStrength: suggestedStrength,
    suggestedRetuneSpeed: pitchScore < 55 ? 0.78 : 0.52,
    retakeNotes,
    live: ["pitch trend", "sharp/flat report", "AutoTune strength suggestion", "retake notes"],
    queued: ["formant-aware emotion classification", "real-time singing lesson mode"],
  };
}

export function createDefaultWarmups(previous?: VocalWarmupStudioState): VocalWarmupStudioState {
  const completed = new Map((previous?.drills ?? []).map((d) => [d.id, d.completedAt ?? null]));
  const seed: VocalWarmupDrill[] = [
    { id: "breath-box", title: "Box Breathing", category: "breathing", durationMin: 3, instruction: "Inhale 4, hold 4, exhale 4, hold 4. Keep shoulders still." },
    { id: "sirens-soft", title: "Soft Sirens", category: "pitch", durationMin: 4, instruction: "Glide low to high on a hum, then back down without pushing." },
    { id: "pitch-match", title: "Pitch Match Holds", category: "pitch", durationMin: 5, instruction: "Hold a note for 4 beats, then release cleanly before the next note." },
    { id: "rap-pocket", title: "Rap Pocket Grid", category: "rapTiming", durationMin: 5, instruction: "Speak one bar straight, one bar behind the beat, one bar ahead, then center it." },
    { id: "scale-five", title: "Five-Note Scale", category: "singingScale", durationMin: 6, instruction: "Sing 1-2-3-4-5-4-3-2-1 softly before recording." },
    { id: "record-check", title: "Before Recording", category: "checklist", durationMin: 2, instruction: "Water, headphones, pop filter, input peaks below -6 dB, one silent room-tone take." },
  ];
  const drills = seed.map((d) => ({ ...d, completedAt: completed.get(d.id) ?? null }));
  return { drills, lastFeedback: previous?.lastFeedback ?? [], streakDays: previous?.streakDays ?? 0, updatedAt: Date.now() };
}

export function warmupFeedback(drill: VocalWarmupDrill, tuneReport?: VocalTuneAssistReport | null) {
  if (drill.category === "breathing") return "Breath prep logged. Listen for steadier line endings on the next take.";
  if (drill.category === "rapTiming") return "Timing drill logged. Record the verse with the grid on and check consonant placement.";
  if (drill.category === "checklist") return "Checklist complete. Capture 2 seconds of room tone before the take for cleaner noise reduction.";
  if (tuneReport && tuneReport.sharpFlat !== "centered") return `Warmup logged. Your last take was ${tuneReport.sharpFlat}; start the next pass slightly more relaxed.`;
  return "Warmup logged. Next take should need less correction if you keep the same support.";
}
