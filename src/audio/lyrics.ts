import type { LyricLine, LyricSectionId, ProducerTeamNote, Project } from "../state/types";

const VOWELS = /[aeiouy]+/gi;
const WORD_RE = /[a-z0-9']+/gi;

export const LYRIC_SECTIONS: { id: LyricSectionId; label: string }[] = [
  { id: "intro", label: "Intro" },
  { id: "verse", label: "Verse" },
  { id: "pre-hook", label: "Pre-Hook" },
  { id: "hook", label: "Hook" },
  { id: "bridge", label: "Bridge" },
  { id: "outro", label: "Outro" },
];

const RHYME_BANK: Record<string, string[]> = {
  ay: ["stay", "play", "late", "change", "same", "rain", "away", "fade"],
  ee: ["me", "see", "dream", "free", "need", "peace", "believe", "street"],
  oh: ["go", "home", "alone", "cold", "road", "soul", "control", "show"],
  eye: ["time", "night", "light", "mine", "find", "ride", "alive", "sky"],
  oo: ["you", "move", "truth", "blue", "room", "lose", "proof", "smooth"],
  ar: ["heart", "dark", "stars", "far", "start", "scar", "hard", "apart"],
};

export function lyricWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).filter(Boolean);
}

export function countSyllables(text: string): number {
  return lyricWords(text).reduce((sum, word) => {
    const clean = word.replace(/e$/i, "");
    const groups = clean.match(VOWELS)?.length ?? 0;
    return sum + Math.max(1, groups);
  }, 0);
}

export function rhymeKey(text: string): string {
  const words = lyricWords(text);
  const last = words.length ? words[words.length - 1] : "";
  const tail = last.slice(-4);
  if (/(ay|ai|a$|ate|ain|ame)$/.test(tail)) return "ay";
  if (/(ee|ea|y$|eed|eam|ieve)$/.test(tail)) return "ee";
  if (/(o$|ow|oa|old|ome|oul)$/.test(tail)) return "oh";
  if (/(i$|igh|ine|ime|ide|ive|ight)$/.test(tail)) return "eye";
  if (/(oo|ue|u$|oom|ooth|ove)$/.test(tail)) return "oo";
  if (/(ar|art|ard|ark|ars)$/.test(tail)) return "ar";
  return last.slice(-2) || "na";
}

export function rhymeSuggestions(text: string): { exact: string[]; near: string[] } {
  const key = rhymeKey(text);
  const exact = RHYME_BANK[key] ?? [];
  const nearKeys = Object.keys(RHYME_BANK).filter((k) => k !== key).slice(0, 2);
  return {
    exact: exact.slice(0, 8),
    near: nearKeys.flatMap((k) => RHYME_BANK[k].slice(0, 3)).slice(0, 8),
  };
}

export function rhymeScheme(lines: LyricLine[]): Record<string, string> {
  const keys = new Map<string, string>();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let index = 0;
  const out: Record<string, string> = {};
  for (const line of lines) {
    const key = rhymeKey(line.text);
    if (!keys.has(key)) keys.set(key, letters[index++] ?? "?");
    out[line.id] = keys.get(key)!;
  }
  return out;
}

export function repeatedWords(lines: LyricLine[]): string[] {
  const ignore = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "my", "your", "i", "me", "you", "we"]);
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const word of lyricWords(line.text)) {
      if (ignore.has(word) || word.length < 3) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

export function lyricLineMetrics(line: LyricLine, tempo: number) {
  const syllables = countSyllables(line.text);
  const words = lyricWords(line.text).length;
  const barSec = (60 / Math.max(40, tempo)) * 4;
  const regionSec = line.regionStartSec != null && line.regionEndSec != null
    ? Math.max(0.25, line.regionEndSec - line.regionStartSec)
    : barSec;
  const bars = Math.max(0.25, regionSec / barSec);
  const syllablesPerBar = syllables / bars;
  const density = Math.min(100, Math.round((syllablesPerBar / 16) * 100));
  const warnings = [
    syllablesPerBar > 15 ? "Too crowded for clean delivery" : "",
    syllablesPerBar < 4 && words > 0 ? "Line may be too short" : "",
    words > 14 ? "Long phrase: consider a breath mark" : "",
  ].filter(Boolean);
  return { syllables, words, bars, syllablesPerBar, density, warnings };
}

export function createLyricProducerNotes(project: Project): ProducerTeamNote[] {
  const studio = project.lyricStudio;
  if (!studio) return [];
  const lines = studio.lines.filter((line) => line.text.trim());
  const notes: ProducerTeamNote[] = [];
  const scheme = rhymeScheme(lines);
  const repeats = repeatedWords(lines);
  const now = Date.now();

  for (const line of lines) {
    const metrics = lyricLineMetrics(line, project.tempo);
    if (metrics.syllablesPerBar > 15) {
      notes.push({
        id: `lyric:${line.id}:crowded`,
        role: "songwriter",
        title: "Crowded lyric line",
        detail: `Line ${line.order + 1} has ${metrics.syllables} syllables over roughly ${metrics.bars.toFixed(1)} bars.`,
        why: "Dense lines can blur pronunciation and make punch-ins harder unless the pocket is intentionally fast.",
        confidence: 0.82,
        severity: "medium",
        lineId: line.id,
        timeSec: line.timeSec ?? line.regionStartSec ?? null,
        action: "mark-punch",
        status: "open",
        createdAt: now,
      });
    }
    if (line.section === "hook" && metrics.words < 4) {
      notes.push({
        id: `lyric:${line.id}:hook-short`,
        role: "producer",
        title: "Hook may need a stronger phrase",
        detail: `Hook line ${line.order + 1} is very short. Rhyme ${scheme[line.id]} is usable, but the phrase may not carry the chorus alone.`,
        why: "Hooks usually need a clear, repeatable emotional phrase that listeners can remember after one pass.",
        confidence: 0.7,
        severity: "low",
        lineId: line.id,
        action: "mark-double",
        status: "open",
        createdAt: now,
      });
    }
    if (metrics.words > 10 && !line.performance.breathAfter) {
      notes.push({
        id: `lyric:${line.id}:breath`,
        role: "vocal",
        title: "Add a breath plan",
        detail: `Line ${line.order + 1} is long enough that breath placement should be marked before recording.`,
        why: "Breath marks reduce tired takes and make comping more consistent across punch-ins.",
        confidence: 0.78,
        severity: "low",
        lineId: line.id,
        action: "mark-breath",
        status: "open",
        createdAt: now,
      });
    }
  }

  if (repeats.length) {
    notes.push({
      id: `lyric:repeated:${repeats.slice(0, 3).join("-")}`,
      role: "songwriter",
      title: "Repeated words detected",
      detail: `Frequently repeated: ${repeats.slice(0, 5).join(", ")}.`,
      why: "Intentional repetition can make a hook sticky; accidental repetition can make verses feel underwritten.",
      confidence: 0.74,
      severity: "info",
      action: "save-note",
      status: "open",
      createdAt: now,
    });
  }

  return notes.slice(0, 10);
}
