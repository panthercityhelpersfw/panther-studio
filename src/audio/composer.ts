/**
 * Local, rule-based music composer. Parses a plain-English command and generates
 * a real arrangement (chords, bass, melody, drums) as MIDI note data routed to
 * software instruments. No cloud, no ML — deterministic music theory + patterns.
 * See LOCAL_COMPOSER.md.
 *
 * Examples it understands:
 *   "make a sad piano loop in C minor"
 *   "add trap drums"
 *   "make chords emotional"  /  "make bass follow chords"
 *   "create 8 bar hook"
 */
import { DRUM_MAP } from "./instruments";
import type { InstrumentId } from "../state/types";

export interface ComposedNote {
  pitch: number;
  startSec: number;
  durationSec: number;
  velocity: number;
}

export interface ComposedPart {
  name: string;
  instrument: InstrumentId;
  busId: string;
  notes: ComposedNote[];
  bars: number;
}

export interface Composition {
  tempo: number;
  key: number; // 0..11
  scale: "major" | "minor";
  bars: number;
  parts: ComposedPart[];
  summary: string;
}

const KEY_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const KEY_ALIASES: Record<string, number> = {
  db: 1, eb: 3, gb: 6, ab: 8, bb: 10,
};

type Genre = "rap" | "trap" | "rnb" | "pop" | "rock" | "cinematic" | "podcast";
type Mood = "sad" | "happy" | "dark" | "emotional" | "chill" | "hype" | "aggressive" | "neutral";

const GENRE_TEMPO: Record<Genre, number> = {
  rap: 90, trap: 140, rnb: 80, pop: 120, rock: 128, cinematic: 70, podcast: 85,
};

// Chord progressions as scale-degree roots (0-based) + quality, per mood.
// Quality: "maj" | "min" | "maj7" | "min7".
type Chord = { root: number; quality: "maj" | "min" | "maj7" | "min7" };

function progressionFor(mood: Mood, scale: "major" | "minor"): Chord[] {
  if (scale === "minor") {
    switch (mood) {
      case "sad":
      case "emotional":
        return [{ root: 0, quality: "min" }, { root: 8, quality: "maj" }, { root: 3, quality: "maj" }, { root: 10, quality: "maj" }]; // i VI III VII
      case "dark":
      case "aggressive":
        return [{ root: 0, quality: "min" }, { root: 0, quality: "min" }, { root: 8, quality: "maj" }, { root: 10, quality: "maj" }];
      case "chill":
        return [{ root: 0, quality: "min7" }, { root: 5, quality: "min7" }, { root: 10, quality: "maj7" }, { root: 3, quality: "maj7" }]; // i iv VII III
      case "hype":
        return [{ root: 0, quality: "min" }, { root: 5, quality: "min" }, { root: 0, quality: "min" }, { root: 10, quality: "maj" }];
      default:
        return [{ root: 0, quality: "min" }, { root: 5, quality: "min" }, { root: 8, quality: "maj" }, { root: 10, quality: "maj" }];
    }
  }
  // major
  switch (mood) {
    case "happy":
      return [{ root: 0, quality: "maj" }, { root: 7, quality: "maj" }, { root: 9, quality: "min" }, { root: 5, quality: "maj" }]; // I V vi IV
    case "chill":
      return [{ root: 0, quality: "maj7" }, { root: 9, quality: "min7" }, { root: 5, quality: "maj7" }, { root: 7, quality: "maj" }];
    case "emotional":
      return [{ root: 9, quality: "min" }, { root: 5, quality: "maj" }, { root: 0, quality: "maj" }, { root: 7, quality: "maj" }]; // vi IV I V
    default:
      return [{ root: 0, quality: "maj" }, { root: 5, quality: "maj" }, { root: 9, quality: "min" }, { root: 7, quality: "maj" }];
  }
}

function chordTones(rootSemitone: number, quality: Chord["quality"]): number[] {
  switch (quality) {
    case "maj": return [0, 4, 7].map((x) => rootSemitone + x);
    case "min": return [0, 3, 7].map((x) => rootSemitone + x);
    case "maj7": return [0, 4, 7, 11].map((x) => rootSemitone + x);
    case "min7": return [0, 3, 7, 10].map((x) => rootSemitone + x);
  }
}

function parseKey(text: string): { key: number; scale: "major" | "minor" } {
  let key = 0;
  let scale: "major" | "minor" = "minor";
  // Require explicit context so words like "a" in "a sad loop" aren't treated
  // as a key: either "in/key of <note>" or "<note> minor/major".
  const ctx = text.match(/\b(?:in|key of)\s+([a-g](#|b)?)\b(?:\s*(minor|min|major|maj))?/i);
  const suffix = text.match(/\b([a-g](#|b)?)\s*(minor|major)\b/i);
  const apply = (note: string, qual?: string) => {
    const n = note.toLowerCase();
    const k = KEY_ALIASES[n] ?? KEY_NAMES.indexOf(n);
    if (k >= 0) key = k;
    if (qual) scale = /maj/i.test(qual) ? "major" : "minor";
  };
  if (ctx) apply(ctx[1], ctx[3]);
  else if (suffix) apply(suffix[1], suffix[3]);

  if (/\bmajor|happy|uplifting|bright\b/i.test(text)) scale = "major";
  if (/\bminor|sad|dark|emotional|moody\b/i.test(text)) scale = "minor";
  return { key, scale };
}

function parseMood(text: string): Mood {
  const t = text.toLowerCase();
  if (/\bsad|melanchol/.test(t)) return "sad";
  if (/\bemotional|moody|heartfelt/.test(t)) return "emotional";
  if (/\bdark|sinister|evil/.test(t)) return "dark";
  if (/\bhappy|uplifting|bright|joy/.test(t)) return "happy";
  if (/\bchill|lofi|lo-fi|relax|smooth/.test(t)) return "chill";
  if (/\bhype|energetic|banger|turn ?up/.test(t)) return "hype";
  if (/\baggressive|hard|angry/.test(t)) return "aggressive";
  return "neutral";
}

function parseGenre(text: string): Genre {
  const t = text.toLowerCase();
  if (/\btrap\b/.test(t)) return "trap";
  if (/\brap|hip ?hop|boom ?bap\b/.test(t)) return "rap";
  if (/\br&b|rnb|r and b|soul\b/.test(t)) return "rnb";
  if (/\bpop\b/.test(t)) return "pop";
  if (/\brock|metal|punk\b/.test(t)) return "rock";
  if (/\bcinematic|film|score|orchestr/.test(t)) return "cinematic";
  if (/\bpodcast|lofi|lo-fi|bed\b/.test(t)) return "podcast";
  return "rap";
}

function parseBars(text: string): number {
  const m = text.match(/(\d+)\s*[- ]?\s*bar/i);
  if (m) return Math.max(1, Math.min(32, parseInt(m[1])));
  if (/\bhook|chorus\b/i.test(text)) return 8;
  return 4;
}

// 16-step drum patterns (1 = hit) per genre.
function drumPattern(genre: Genre): { kick: number[]; snare: number[]; hat: number[]; openHat: number[] } {
  const z = () => new Array(16).fill(0);
  const k = z(), s = z(), h = z(), oh = z();
  const set = (arr: number[], idxs: number[]) => idxs.forEach((i) => (arr[i] = 1));
  switch (genre) {
    case "trap":
      set(k, [0, 6, 10]); set(s, [4, 12]); set(h, [0, 2, 4, 6, 7, 8, 10, 12, 14, 15]); set(oh, [14]); break;
    case "rap":
      set(k, [0, 10]); set(s, [4, 12]); set(h, [0, 2, 4, 6, 8, 10, 12, 14]); break;
    case "rnb":
      set(k, [0, 7]); set(s, [4, 12]); set(h, [2, 6, 10, 14]); break;
    case "pop":
      set(k, [0, 4, 8, 12]); set(s, [4, 12]); set(h, [0, 2, 4, 6, 8, 10, 12, 14]); break;
    case "rock":
      set(k, [0, 8]); set(s, [4, 12]); set(h, [0, 2, 4, 6, 8, 10, 12, 14]); break;
    case "cinematic":
      set(k, [0]); set(s, [8]); break;
    case "podcast":
      break; // no drums (bed music)
  }
  return { kick: k, snare: s, hat: h, openHat: oh };
}

export function compose(prompt: string): Composition {
  const text = prompt.trim() || "emotional trap beat";
  const genre = parseGenre(text);
  const mood = parseMood(text);
  const { key, scale } = parseKey(text);
  const bars = parseBars(text);
  const tempo = GENRE_TEMPO[genre];
  const beat = 60 / tempo;
  const barSec = beat * 4;
  const stepSec = barSec / 16;

  // Which elements?
  const t = text.toLowerCase();
  const wantChords = /chord|piano|keys|loop|hook|beat|emotional|harmon/.test(t) || true;
  const wantBass = /bass|808|low/.test(t) || /beat|hook|trap|rap|loop/.test(t);
  const wantMelody = /melody|lead|piano loop|hook|loop|topline/.test(t);
  const wantDrums = (/drum|beat|trap|rap|808|hat|kick|snare|hook|rock|pop/.test(t) || true) && genre !== "podcast";

  const prog = progressionFor(mood, scale);
  const chordInstr: InstrumentId = /piano/.test(t) ? "piano" : genre === "rnb" || mood === "chill" ? "epiano" : genre === "cinematic" ? "pad" : "pad";

  const parts: ComposedPart[] = [];

  // Chords: one chord per bar, cycling the progression.
  if (wantChords) {
    const notes: ComposedNote[] = [];
    for (let b = 0; b < bars; b++) {
      const chord = prog[b % prog.length];
      const tones = chordTones(60 + key + chord.root - 12, chord.quality); // around C4
      for (const p of tones) {
        notes.push({ pitch: p, startSec: b * barSec, durationSec: barSec * 0.98, velocity: 0.6 });
      }
    }
    parts.push({ name: "Chords", instrument: chordInstr, busId: "music", notes, bars });
  }

  // Bass follows the chord roots, rhythmic.
  if (wantBass) {
    const notes: ComposedNote[] = [];
    const rhythm = genre === "trap" ? [0, 6, 10] : genre === "rock" ? [0, 8] : [0, 8, 12];
    for (let b = 0; b < bars; b++) {
      const chord = prog[b % prog.length];
      const root = 36 + key + chord.root; // C2-ish
      for (const step of rhythm) {
        notes.push({ pitch: root, startSec: b * barSec + step * stepSec, durationSec: stepSec * (genre === "trap" ? 5 : 3), velocity: 0.8 });
      }
    }
    parts.push({ name: "Bass", instrument: "bass", busId: "music", notes, bars });
  }

  // Melody: scale-tone topline from chord tones with simple rhythm.
  if (wantMelody) {
    const notes: ComposedNote[] = [];
    const lead: InstrumentId = /piano/.test(t) ? "piano" : genre === "cinematic" ? "pad" : "lead";
    for (let b = 0; b < bars; b++) {
      const chord = prog[b % prog.length];
      const tones = chordTones(72 + key + chord.root - 12, chord.quality); // C5-ish
      const steps = [0, 4, 8, 12, 14];
      for (let i = 0; i < steps.length; i++) {
        const pitch = tones[(i + b) % tones.length];
        notes.push({ pitch, startSec: b * barSec + steps[i] * stepSec, durationSec: stepSec * 3, velocity: 0.7 });
      }
    }
    parts.push({ name: "Melody", instrument: lead, busId: "music", notes, bars });
  }

  // Drums.
  if (wantDrums) {
    const pat = drumPattern(genre);
    const notes: ComposedNote[] = [];
    const addLane = (steps: number[], pitch: number, vel: number) => {
      for (let b = 0; b < bars; b++) {
        for (let s = 0; s < 16; s++) {
          if (steps[s]) notes.push({ pitch, startSec: b * barSec + s * stepSec, durationSec: stepSec, velocity: vel });
        }
      }
    };
    addLane(pat.kick, DRUM_MAP.kick, 0.95);
    addLane(pat.snare, DRUM_MAP.snare, 0.85);
    addLane(pat.hat, DRUM_MAP.hatClosed, 0.6);
    addLane(pat.openHat, DRUM_MAP.hatOpen, 0.6);
    if (notes.length > 0) parts.push({ name: "Drums", instrument: "drumkit", busId: "drums", notes, bars });
  }

  const keyName = KEY_NAMES[key].toUpperCase();
  const summary = `${bars}-bar ${mood !== "neutral" ? mood + " " : ""}${genre} idea in ${keyName} ${scale} at ${tempo} BPM (${parts.map((p) => p.name).join(", ")}).`;

  return { tempo, key, scale, bars, parts, summary };
}
