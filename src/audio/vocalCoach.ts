/**
 * Vocal Coach analysis engine. Produces real, measurement-backed scores and
 * feedback for a recorded vocal take, plus phrase-level markers, creative idea
 * suggestions, and beginner coaching tips.
 *
 * What's measured (real):
 *  - Pitch accuracy & stability: from per-frame autocorrelation (autotune.ts),
 *    compared against the nearest note in the chosen key/scale.
 *  - Timing: onset detection vs. the tempo grid.
 *  - Loudness consistency & energy: frame-RMS statistics.
 *  - Clarity / sibilance / clipping: spectral band ratios + peak analysis.
 *
 * What's opinion (clearly labelled "creative suggestion" in the UI):
 *  - Spark Ideas (ad-libs, doubles, harmonies, reverb/delay throws).
 * See VOCAL_COACH_ENGINE.md / PERFORMANCE_ANALYSIS.md / CREATIVE_DIRECTION_ENGINE.md.
 */
import { detectPitchTrack, SCALES, KEY_NAMES, type ScaleId } from "./autotune";
import { analyzeBuffer } from "./autoEnhance";

export interface CoachScores {
  pitch: number;
  timing: number;
  clarity: number;
  energy: number;
  consistency: number;
  mixReady: number;
  overall: number;
}

export interface CoachMarker {
  /** Seconds relative to the clip start. */
  timeSec: number;
  text: string;
  kind: "issue" | "idea" | "tip";
  severity: "ok" | "warn" | "bad";
}

export interface CoachResult {
  scores: CoachScores;
  markers: CoachMarker[];
  feedback: string[];
  ideas: string[];
  tips: string[];
  /** Best candidate region to punch in (seconds, relative to clip start). */
  punchIn: { startSec: number; endSec: number } | null;
}

export interface CoachOptions {
  tempo: number;
  key: number;
  scale: ScaleId;
  /** Clip start on the timeline, for grid-relative timing. */
  clipStartSec: number;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function mixMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  const ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i] / ch;
  }
  return out;
}

export function analyzeTake(buffer: AudioBuffer, opts: CoachOptions): CoachResult {
  const fs = buffer.sampleRate;
  const mono = mixMono(buffer);
  const track = detectPitchTrack(buffer, {
    key: opts.key, scale: opts.scale, strength: 1, speed: 1, humanize: 0, formantPreserve: false,
  });
  const band = analyzeBuffer(buffer);

  // ---- Pitch accuracy & stability ----
  const voiced = track.filter((f) => f.midi != null && f.targetMidi != null);
  let centsSum = 0;
  for (const f of voiced) centsSum += Math.abs((f.midi! - f.targetMidi!) * 100);
  const avgCents = voiced.length ? centsSum / voiced.length : 0;
  // Stability: std-dev of pitch within voiced runs.
  let driftSum = 0, driftN = 0;
  for (let i = 1; i < voiced.length; i++) {
    driftSum += Math.abs((voiced[i].midi! - voiced[i - 1].midi!) * 100);
    driftN++;
  }
  const avgDriftCents = driftN ? driftSum / driftN : 0;
  const pitchScore = clamp(100 - avgCents * 1.4 - Math.max(0, avgDriftCents - 30) * 0.4);

  // ---- Timing (onset vs grid) ----
  const beat = 60 / opts.tempo;
  const hop = Math.floor(fs * 0.01);
  const win = hop * 2;
  let prevE = 0;
  const onsets: number[] = [];
  for (let i = 0; i < mono.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(mono.length, i + win); j++) e += mono[j] * mono[j];
    e = Math.sqrt(e / win);
    if (e > 0.05 && e > prevE * 1.6) onsets.push((i / fs) + opts.clipStartSec);
    prevE = e;
  }
  let timingDev = 0;
  for (const t of onsets) {
    const grid = Math.round(t / (beat / 2)) * (beat / 2); // nearest 1/8
    timingDev += Math.abs(t - grid) / beat;
  }
  const avgTimingDev = onsets.length ? timingDev / onsets.length : 0;
  const timingScore = onsets.length < 2 ? 70 : clamp(100 - avgTimingDev * 220);

  // ---- Loudness consistency & energy ----
  const rmsFrames: number[] = [];
  for (let i = 0; i < mono.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(mono.length, i + win); j++) e += mono[j] * mono[j];
    rmsFrames.push(Math.sqrt(e / win));
  }
  const loud = rmsFrames.filter((r) => r > 0.02);
  const mean = loud.reduce((a, b) => a + b, 0) / Math.max(1, loud.length);
  const variance = loud.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, loud.length);
  const cv = mean > 1e-5 ? Math.sqrt(variance) / mean : 1;
  const consistency = clamp(100 - cv * 110);
  const energy = clamp(100 - Math.abs(band.rmsDb + 16) * 5); // ideal ~ -16 dBFS RMS

  // ---- Clarity / mix-readiness ----
  let clarity = 100;
  if (band.guesses.boomy) clarity -= 25;
  if (band.guesses.harsh) clarity -= 20;
  if (band.guesses.dull) clarity -= 15;
  clarity = clamp(clarity);
  let mixReady = 100;
  if (band.guesses.clipping) mixReady -= 45;
  if (band.guesses.quiet) mixReady -= 25;
  if (band.guesses.harsh) mixReady -= 15;
  if (band.highRatio > 0.34) mixReady -= 10; // sibilance
  mixReady = clamp(mixReady);

  const overall = clamp(
    pitchScore * 0.28 + timingScore * 0.18 + clarity * 0.16 + energy * 0.12 + consistency * 0.14 + mixReady * 0.12
  );

  const scores: CoachScores = {
    pitch: Math.round(pitchScore),
    timing: Math.round(timingScore),
    clarity: Math.round(clarity),
    energy: Math.round(energy),
    consistency: Math.round(consistency),
    mixReady: Math.round(mixReady),
    overall: Math.round(overall),
  };

  // ---- Phrase detection (split by silence gaps) ----
  const phrases: { start: number; end: number }[] = [];
  let inPhrase = false, pStart = 0, silence = 0;
  const frameDur = hop / fs;
  for (let i = 0; i < rmsFrames.length; i++) {
    const t = i * frameDur;
    if (rmsFrames[i] > 0.03) {
      if (!inPhrase) { inPhrase = true; pStart = t; }
      silence = 0;
    } else if (inPhrase) {
      silence += frameDur;
      if (silence > 0.25) { phrases.push({ start: pStart, end: t - silence }); inPhrase = false; }
    }
  }
  if (inPhrase) phrases.push({ start: pStart, end: rmsFrames.length * frameDur });

  // ---- Phrase-level markers ----
  const markers: CoachMarker[] = [];
  const framesInWindow = (a: number, b: number) =>
    voiced.filter((f) => f.t >= a && f.t <= b);
  let worst: { startSec: number; endSec: number; bad: number } | null = null;
  for (const ph of phrases) {
    const fr = framesInWindow(ph.start, ph.end);
    let badness = 0;
    if (fr.length) {
      const offCents = fr.reduce((a, f) => a + (f.midi! - f.targetMidi!) * 100, 0) / fr.length;
      if (Math.abs(offCents) > 25) {
        badness += Math.abs(offCents);
        markers.push({
          timeSec: ph.start,
          text: `${offCents < 0 ? "Slightly flat" : "Slightly sharp"} on this phrase (${Math.abs(Math.round(offCents))}¢).`,
          kind: "issue",
          severity: Math.abs(offCents) > 45 ? "bad" : "warn",
        });
      }
    }
    // Phrase loudness drop at the end.
    const startIdx = Math.floor(ph.start / frameDur);
    const endIdx = Math.floor(ph.end / frameDur);
    if (endIdx - startIdx > 6) {
      const head = rmsFrames.slice(startIdx, startIdx + 3).reduce((a, b) => a + b, 0) / 3;
      const tail = rmsFrames.slice(endIdx - 3, endIdx).reduce((a, b) => a + b, 0) / 3;
      if (tail < head * 0.5) {
        badness += 20;
        markers.push({ timeSec: ph.end - 0.3, text: "This line gets too quiet near the end.", kind: "issue", severity: "warn" });
      }
    }
    if (!worst || badness > worst.bad) worst = { startSec: ph.start, endSec: ph.end, bad: badness };
  }

  // ---- Mini coach feedback ----
  const feedback: string[] = [];
  if (avgCents > 25) feedback.push(`Pitch is off by ~${Math.round(avgCents)}¢ on average — try the autotune or re-sing the flat phrases.`);
  else feedback.push("Pitch is solid across the take.");
  if (avgDriftCents > 60) feedback.push("Notes wobble a bit — support sustained notes with steady breath.");
  if (timingScore < 70 && onsets.length >= 2) feedback.push("Some words land off the beat — try recording with the metronome and a count-in.");
  if (band.guesses.clipping) feedback.push("Clipping detected — back off the mic on loud notes or lower input gain.");
  if (band.guesses.quiet) feedback.push("The take is quiet — move closer or raise input gain, then re-check levels.");
  if (consistency < 60) feedback.push("Volume jumps around — a vocal level-rider will even it out.");
  if (band.highRatio > 0.34) feedback.push("Sibilance is strong — this section may need de-essing.");
  if (band.guesses.boomy) feedback.push("Low end is boomy — a high-pass will clean it up.");
  if (scores.overall >= 80) feedback.push("Great take overall — this is close to mix-ready.");

  // ---- Creative ideas (opinion) ----
  const ideas: string[] = [];
  if (phrases.length >= 2) {
    ideas.push("Double this hook for a thicker, wider sound.");
    ideas.push(`Add a harmony a third above (in ${KEY_NAMES[opts.key]} ${SCALES[opts.scale].name}).`);
  }
  ideas.push("Throw a reverb tail on the last word of each phrase.");
  ideas.push("Add a delay throw on an ad-lib before the hook.");
  ideas.push("Layer call-and-response ad-libs under the main vocal.");
  if (phrases.length) ideas.push("Cut the beat for a bar before the hook to build energy.");
  ideas.push("Punch in the strongest word instead of re-recording the whole take.");

  // ---- Beginner tips ----
  const tips: string[] = [];
  if (band.guesses.clipping) tips.push("Mic distance: keep a fist's width and pull back on belted notes.");
  if (band.guesses.quiet) tips.push("Mic distance: get closer (a few inches) for presence and body.");
  if (avgDriftCents > 60) tips.push("Breath control: take a full breath before long phrases to steady pitch.");
  if (consistency < 60) tips.push("Volume control: aim for an even delivery; let the mixer handle dynamics.");
  if (timingScore < 70) tips.push("Timing pocket: tap the beat with your foot and breathe in rhythm.");
  tips.push("Enunciation: slightly over-articulate consonants so lyrics stay clear in the mix.");
  if (markers.some((m) => m.kind === "issue")) tips.push("Punch in the flagged phrases rather than re-recording everything.");

  const punchIn = worst && worst.bad > 0 ? { startSec: worst.startSec, endSec: worst.endSec } : null;

  return { scores, markers, feedback, ideas, tips, punchIn };
}
