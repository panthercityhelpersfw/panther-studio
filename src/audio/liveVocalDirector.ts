import type {
  ArtistProgressSnapshot,
  ID,
  LiveDirectorMode,
  LiveTakeDirectorSummary,
  LiveVocalIssueKind,
  LiveVocalMarker,
  LiveWordFeedback,
  LyricLine,
  VocalWarmupDrill,
} from "../state/types";

export interface LiveVocalFrame {
  sampleRate: number;
  timeSec: number;
  rms: number;
  peak: number;
  zcr: number;
  pitchHz: number | null;
  spectralCentroid: number;
  lowRatio: number;
  lowMidRatio: number;
  presenceRatio: number;
  highRatio: number;
  active: boolean;
  tempo: number;
  mode: LiveDirectorMode;
  targetKey: number;
  targetScale: string;
  lyricLines: LyricLine[];
  previousRms: number;
  previousPitchHz: number | null;
}

export interface LiveVocalFrameResult {
  marker: Omit<LiveVocalMarker, "id" | "createdAt"> | null;
  word: Omit<LiveWordFeedback, "id" | "createdAt"> | null;
  score: number;
  message: string;
  severity: "ok" | "warn" | "bad";
  metrics: {
    pitchConsistency: number;
    timingConsistency: number;
    breathControl: number;
    deliveryStrength: number;
    energy: number;
  };
}

const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR = new Set([0, 2, 3, 5, 7, 8, 10]);

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function midiFromHz(hz: number) {
  return 69 + 12 * Math.log2(hz / 440);
}

function pitchPenalty(frame: LiveVocalFrame) {
  if (!frame.pitchHz) return 0;
  if (frame.targetScale === "chromatic") return 0;
  const midi = midiFromHz(frame.pitchHz);
  const pitchClass = ((Math.round(midi) - frame.targetKey) % 12 + 12) % 12;
  const scale = frame.targetScale === "minor" ? MINOR : MAJOR;
  if (scale.has(pitchClass)) return 0;
  const dist = Math.min(...[...scale].map((pc) => Math.min(Math.abs(pc - pitchClass), 12 - Math.abs(pc - pitchClass))));
  return dist >= 2 ? 18 : 9;
}

function currentLyricWord(frame: LiveVocalFrame): { lineId: ID | null; word: string } | null {
  const timed = frame.lyricLines
    .filter((line) => line.text.trim() && line.regionStartSec != null && line.regionEndSec != null)
    .find((line) => frame.timeSec >= (line.regionStartSec ?? 0) && frame.timeSec <= (line.regionEndSec ?? 0));
  if (!timed) return null;
  const words = timed.text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const span = Math.max(0.2, (timed.regionEndSec ?? frame.timeSec + 1) - (timed.regionStartSec ?? frame.timeSec));
  const pos = Math.min(words.length - 1, Math.floor(((frame.timeSec - (timed.regionStartSec ?? 0)) / span) * words.length));
  return { lineId: timed.id, word: words[pos].replace(/[^\w'-]/g, "") || words[pos] };
}

function issueMessage(kind: LiveVocalIssueKind, mode: LiveDirectorMode) {
  const coach = mode === "engineer" ? "technical" : mode === "artistDevelopment" ? "growth" : "performance";
  const copy: Record<LiveVocalIssueKind, { message: string; why: string; fix: string }> = {
    strong: {
      message: mode === "producer" ? "Good take. Keep that pocket." : "Strong section.",
      why: "Level, tone, and stability are in the target range.",
      fix: "Repeat this physical distance and delivery shape.",
    },
    level: {
      message: "Vocal level is inconsistent.",
      why: "Input energy moved sharply compared with the previous live window.",
      fix: "Hold mic distance steady and support the phrase from the breath.",
    },
    clipping: {
      message: "Mic overload or clipping risk.",
      why: "The live peak is too close to full scale.",
      fix: "Back slightly away from the mic or lower input gain before the next line.",
    },
    pitch: {
      message: "Pitch drifted outside the target key.",
      why: "The detected note is not landing cleanly in the selected scale context.",
      fix: "Relax the onset, aim the note before adding intensity, then retake this phrase.",
    },
    timing: {
      message: "Timing drifted off the beat grid.",
      why: "The phrase energy landed between expected beat pockets.",
      fix: "Tap the groove with your body and leave a slightly cleaner pause before the next word.",
    },
    energy: {
      message: "Energy dropped at the end.",
      why: "Live RMS fell while the phrase continued.",
      fix: "Push the last word with more breath support and facial expression.",
    },
    breath: {
      message: "Breath hit the mic too hard.",
      why: "Low-frequency air energy jumped faster than the vocal tone.",
      fix: "Turn slightly off-axis for breaths and reset before the next bar.",
    },
    plosive: {
      message: "Plosive pressure detected.",
      why: "A sudden low-frequency peak suggests P/B/T air impact.",
      fix: "Angle the condenser 15-30 degrees off-axis or back up a few inches.",
    },
    sibilance: {
      message: "Sibilance is poking out.",
      why: "High-frequency energy is dominating the phrase.",
      fix: "Soften S and SH sounds, then use de-essing if the take is otherwise strong.",
    },
    mud: {
      message: "Pronunciation sounds muddy.",
      why: "Low-mid buildup is masking clarity.",
      fix: `Open the mouth shape more and keep ${coach} energy forward, not swallowed.`,
    },
    harsh: {
      message: "Harsh highs are building.",
      why: "Presence energy rose sharply during a louder moment.",
      fix: "Pull back intensity on peaks or shift slightly off the mic axis.",
    },
    noise: {
      message: "Background noise is audible.",
      why: "Input energy is present without a stable pitch or vocal envelope.",
      fix: "Pause fans/noise sources and capture a second of room tone before recording.",
    },
    pronunciation: {
      message: "This word sounds unclear.",
      why: "Energy is present, but pitch/clarity cues are unstable.",
      fix: "Retake slower, emphasize consonants, then return to the pocket.",
    },
  };
  return copy[kind];
}

export function analyzeLiveVocalFrame(frame: LiveVocalFrame): LiveVocalFrameResult {
  const beatSec = 60 / Math.max(40, frame.tempo);
  const beatPhase = (frame.timeSec % beatSec) / beatSec;
  const offBeat = Math.min(beatPhase, 1 - beatPhase);
  const pitchCost = pitchPenalty(frame);
  const pitchJump = frame.pitchHz && frame.previousPitchHz ? Math.abs(1200 * Math.log2(frame.pitchHz / frame.previousPitchHz)) : 0;
  const levelJump = Math.abs(frame.rms - frame.previousRms);
  const energyDrop = frame.previousRms > 0.08 && frame.rms < frame.previousRms * 0.56;

  let kind: LiveVocalIssueKind = "strong";
  let severity: "ok" | "warn" | "bad" = "ok";
  let score = 94;

  if (frame.peak > 0.97) {
    kind = "clipping";
    severity = "bad";
    score = 32;
  } else if (frame.peak > 0.72 && frame.lowRatio > 0.34 && levelJump > 0.05) {
    kind = "breath";
    severity = "warn";
    score = 58;
  } else if (frame.peak > 0.82 && frame.lowRatio > 0.28 && levelJump > 0.08) {
    kind = "plosive";
    severity = "bad";
    score = 45;
  } else if (frame.highRatio > 0.3 && frame.rms > 0.035) {
    kind = "sibilance";
    severity = "warn";
    score = 66;
  } else if (frame.lowMidRatio > 0.38 && frame.spectralCentroid < 1200 && frame.rms > 0.04) {
    kind = "mud";
    severity = "warn";
    score = 64;
  } else if (pitchCost > 0) {
    kind = "pitch";
    severity = pitchCost > 12 ? "bad" : "warn";
    score = 74 - pitchCost;
  } else if (pitchJump > 220) {
    kind = "pitch";
    severity = "warn";
    score = 70;
  } else if (energyDrop) {
    kind = "energy";
    severity = "warn";
    score = 68;
  } else if (frame.rms > 0.035 && offBeat > 0.34 && offBeat < 0.5) {
    kind = "timing";
    severity = "warn";
    score = 72;
  } else if (frame.rms < 0.012 && frame.peak > 0.045 && !frame.pitchHz) {
    kind = "noise";
    severity = "warn";
    score = 69;
  } else if (frame.rms > 0.04 && frame.zcr > 0.22 && !frame.pitchHz) {
    kind = "pronunciation";
    severity = "warn";
    score = 67;
  } else if (frame.rms > 0.08 && frame.presenceRatio > 0.42) {
    kind = "harsh";
    severity = "warn";
    score = 70;
  }

  const copy = issueMessage(kind, frame.mode);
  const marker = frame.rms > 0.012 || severity !== "ok"
    ? {
        timeSec: Math.max(0, frame.timeSec - 0.45),
        endSec: frame.timeSec + 0.25,
        severity,
        kind,
        message: copy.message,
        why: copy.why,
        fix: copy.fix,
        score,
      }
    : null;

  const wordInfo = currentLyricWord(frame);
  const word = wordInfo && severity !== "ok"
    ? {
        timeSec: frame.timeSec,
        word: wordInfo.word,
        lineId: wordInfo.lineId,
        severity,
        suggestion: kind === "timing" ? "Pause slightly before this word." : kind === "energy" ? "Stress this word harder." : "Say this smoother.",
        pronunciation: kind === "mud" || kind === "pronunciation" ? "Open the vowel and sharpen the ending consonant." : "Keep the mouth shape consistent.",
        emphasis: kind === "energy" ? "Push the ending with more intent." : "Keep the word in the pocket.",
      }
    : null;

  return {
    marker,
    word,
    score,
    message: copy.message,
    severity,
    metrics: {
      pitchConsistency: clamp(100 - pitchCost - Math.min(30, pitchJump / 12)),
      timingConsistency: clamp(100 - offBeat * 90),
      breathControl: clamp(100 - (kind === "breath" || kind === "plosive" ? 42 : frame.lowRatio * 35)),
      deliveryStrength: clamp(45 + frame.rms * 580 - (energyDrop ? 22 : 0)),
      energy: clamp(frame.rms * 760),
    },
  };
}

export function liveWarmupsForFocus(focus: "singing" | "rap" | "melodicRap" | "aggressive" | "soft"): VocalWarmupDrill[] {
  const base = {
    singing: ["Sirens from chest to head voice", "Five-note scale on an easy vowel", "Sustain one note for stable tone"],
    rap: ["Metronome 16th-note pocket drill", "Consonant clarity at low volume", "Breath reset every two bars"],
    melodicRap: ["Hum the hook melody softly", "Rap the verse on one note", "Switch speech to melody on the hook word"],
    aggressive: ["Low-volume intensity rehearsal", "Jaw release before loud lines", "Plosive control with off-axis mic stance"],
    soft: ["Quiet projection drill", "Breathy onset control", "Close-mic distance consistency"],
  }[focus];
  return base.map((instruction, index) => ({
    id: `live-${focus}-${index}`,
    title: instruction,
    category: index === 0 ? "breathing" : index === 1 ? "rapTiming" : "pitch",
    durationMin: 2,
    instruction,
  }));
}

export function summarizeLiveTake(
  takeName: string,
  markers: LiveVocalMarker[],
  score: number,
  sessionName: string,
): { summary: LiveTakeDirectorSummary; progress: ArtistProgressSnapshot; weekly: string[] } {
  const bad = markers.filter((m) => m.severity === "bad");
  const warn = markers.filter((m) => m.severity === "warn");
  const ok = markers.filter((m) => m.severity === "ok");
  const redoZones = [...bad, ...warn].slice(-10);
  const bestSegments = ok.slice(-6).map((m) => ({
    startSec: m.timeSec,
    endSec: m.endSec,
    reason: m.kind === "strong" ? "Stable pitch, level, and delivery." : m.message,
  }));
  const summary: LiveTakeDirectorSummary = {
    id: "",
    takeName,
    createdAt: Date.now(),
    score,
    redoZones,
    bestSegments,
    compSuggestions: redoZones.length
      ? ["Promote the strongest green segments and punch the red zones first.", "Use yellow zones only if the lyric emotion is better than the cleaner take."]
      : ["This take is a strong comp candidate end-to-end."],
    alternateFlows: ["Try one pass with a shorter pause before the hook.", "Record a lower-intensity double for width."],
    alternateCadences: ["Leave more space after dense bars.", "Punch the last word of each line slightly later for weight."],
  };
  const pitchIssues = markers.filter((m) => m.kind === "pitch").length;
  const timingIssues = markers.filter((m) => m.kind === "timing").length;
  const breathIssues = markers.filter((m) => m.kind === "breath" || m.kind === "plosive").length;
  const progress: ArtistProgressSnapshot = {
    id: "",
    createdAt: Date.now(),
    sessionName,
    score,
    pitchConsistency: clamp(100 - pitchIssues * 9),
    timingConsistency: clamp(100 - timingIssues * 10),
    breathControl: clamp(100 - breathIssues * 12),
    endurance: clamp(70 + ok.length * 3 - bad.length * 5),
    deliveryStrength: clamp(score + ok.length * 2 - warn.length),
    notes: redoZones.slice(0, 3).map((m) => m.message),
  };
  const weekly = [
    `Average live take score: ${score}/100.`,
    pitchIssues ? `Pitch focus: ${pitchIssues} drift moment${pitchIssues > 1 ? "s" : ""} flagged.` : "Pitch consistency held steady.",
    timingIssues ? `Timing focus: tighten ${timingIssues} pocket moment${timingIssues > 1 ? "s" : ""}.` : "Timing stayed close to the beat grid.",
    breathIssues ? "Breath/mic control needs one warmup before the next pass." : "Breath control is trending clean.",
  ];
  return { summary, progress, weekly };
}
