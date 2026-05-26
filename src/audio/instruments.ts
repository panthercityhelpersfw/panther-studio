/**
 * Real software instruments built from Web Audio primitives. Each voice is
 * synthesized from oscillators / filters / noise — nothing is sampled or faked.
 * The same scheduler runs in the live AudioContext (playback) and in an
 * OfflineAudioContext (export / freeze), so what you hear is exactly what you
 * render.
 *
 * A "voice" is scheduled with an absolute start time `when` and a `dur` (the
 * note length). Release tails are added past `dur`.
 */
import type { InstrumentId, MidiNote } from "../state/types";

const midiToFreq = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

/** Short white-noise buffer (cached per context for drum voices). */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 1.0);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

type StopFn = (sources: AudioScheduledSourceNode[]) => void;

/** Schedule one instrument note. Returns the scheduled source nodes (so the live
 *  engine can track / stop them); the offline renderer ignores the return. */
export function scheduleInstrumentNote(
  ctx: BaseAudioContext,
  instrument: InstrumentId,
  note: Pick<MidiNote, "pitch" | "velocity">,
  when: number,
  dur: number,
  dest: AudioNode,
  onStarted?: StopFn
): AudioScheduledSourceNode[] {
  const vel = Math.max(0.05, note.velocity);
  const sources: AudioScheduledSourceNode[] =
    instrument === "drumkit"
      ? drumVoice(ctx, note.pitch, vel, when, dest)
      : tonalVoice(ctx, instrument, note.pitch, vel, when, dur, dest);
  onStarted?.(sources);
  return sources;
}

function tonalVoice(
  ctx: BaseAudioContext,
  instrument: InstrumentId,
  pitch: number,
  vel: number,
  when: number,
  dur: number,
  dest: AudioNode
): AudioScheduledSourceNode[] {
  const freq = midiToFreq(pitch);
  const out = ctx.createGain();
  out.connect(dest);

  const oscs: OscillatorNode[] = [];
  const addOsc = (type: OscillatorType, detuneCents: number, level: number, target: AudioNode) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detuneCents;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(target);
    oscs.push(o);
    return o;
  };

  // Per-instrument timbre + amplitude envelope.
  let attack = 0.005;
  let decay = 0.12;
  let sustain = 0.7;
  let release = 0.12;
  let peak = 0.32 * vel;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 12000;
  tone.connect(out);

  switch (instrument) {
    case "piano": {
      attack = 0.002; decay = 0.7; sustain = 0.0; release = 0.25; peak = 0.5 * vel;
      tone.frequency.value = Math.min(14000, freq * 8 + 2000);
      addOsc("triangle", 0, 1.0, tone);
      addOsc("sine", 0, 0.5, tone); // octave-ish body via harmonic
      const h = addOsc("sine", 1200, 0.18, tone); // bright partial
      h.frequency.value = freq * 2;
      break;
    }
    case "epiano": {
      // Simple 2-op FM (Rhodes-ish bell).
      attack = 0.002; decay = 0.9; sustain = 0.15; release = 0.3; peak = 0.42 * vel;
      tone.frequency.value = 9000;
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = freq;
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = freq * 2; // 2:1 ratio
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(freq * 2.2 * vel, when);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.2, when + 0.6);
      mod.connect(modGain).connect(carrier.frequency);
      carrier.connect(tone);
      oscs.push(carrier, mod);
      break;
    }
    case "bass": {
      attack = 0.008; decay = 0.2; sustain = 0.85; release = 0.1; peak = 0.6 * vel;
      tone.frequency.value = Math.min(2600, freq * 5 + 200);
      addOsc("sawtooth", 0, 0.5, tone);
      addOsc("sine", 0, 0.9, tone); // sub weight
      break;
    }
    case "lead": {
      attack = 0.01; decay = 0.1; sustain = 0.8; release = 0.18; peak = 0.34 * vel;
      tone.frequency.value = Math.min(13000, freq * 7 + 1500);
      tone.Q.value = 6;
      addOsc("sawtooth", -6, 0.6, tone);
      addOsc("sawtooth", 7, 0.6, tone);
      break;
    }
    case "pad": {
      attack = 0.35; decay = 0.4; sustain = 0.8; release = 0.6; peak = 0.26 * vel;
      tone.frequency.value = Math.min(8000, freq * 6 + 1000);
      addOsc("sawtooth", -8, 0.4, tone);
      addOsc("sawtooth", 9, 0.4, tone);
      addOsc("triangle", 0, 0.5, tone);
      break;
    }
    case "pluck": {
      attack = 0.001; decay = 0.18; sustain = 0.0; release = 0.12; peak = 0.4 * vel;
      tone.type = "bandpass";
      tone.frequency.value = freq * 2;
      tone.Q.value = 2;
      addOsc("triangle", 0, 1.0, tone);
      addOsc("square", 0, 0.25, tone);
      break;
    }
    default: {
      // "synth" — the original saw voice.
      tone.frequency.value = Math.min(12000, freq * 6 + 1200);
      attack = 0.008; decay = 0.08; sustain = 0.85; release = 0.08; peak = 0.28 * vel;
      addOsc("sawtooth", 0, 1.0, tone);
    }
  }

  // ADSR on the output gain.
  const g = out.gain;
  const susLevel = Math.max(0.0001, peak * sustain);
  const holdEnd = when + Math.max(attack + decay, dur);
  g.setValueAtTime(0.0001, when);
  g.linearRampToValueAtTime(peak, when + attack);
  g.exponentialRampToValueAtTime(susLevel, when + attack + decay);
  g.setValueAtTime(Math.max(0.0001, susLevel), holdEnd);
  g.exponentialRampToValueAtTime(0.0001, holdEnd + release);

  const stopAt = holdEnd + release + 0.02;
  for (const o of oscs) {
    o.start(when);
    o.stop(stopAt);
  }
  return oscs;
}

/** General-MIDI-ish drum map → synthesized percussion. */
function drumVoice(
  ctx: BaseAudioContext,
  pitch: number,
  vel: number,
  when: number,
  dest: AudioNode
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const out = ctx.createGain();
  out.gain.value = vel;
  out.connect(dest);

  const kick = () => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.0, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + 0.45);
    sources.push(o);
  };
  const snare = () => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.8, when);
    ng.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
    n.connect(hp).connect(ng).connect(out);
    const o = ctx.createOscillator();
    o.type = "triangle"; o.frequency.value = 180;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, when);
    og.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    o.connect(og).connect(out);
    n.start(when); n.stop(when + 0.25);
    o.start(when); o.stop(when + 0.15);
    sources.push(n, o);
  };
  const hat = (open: boolean) => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    const g = ctx.createGain();
    const len = open ? 0.3 : 0.05;
    g.gain.setValueAtTime(0.5, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    n.connect(hp).connect(g).connect(out);
    n.start(when); n.stop(when + len + 0.02);
    sources.push(n);
  };
  const clap = () => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    n.connect(bp).connect(g).connect(out);
    n.start(when); n.stop(when + 0.2);
    sources.push(n);
  };
  const crash = () => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.9);
    n.connect(hp).connect(g).connect(out);
    n.start(when); n.stop(when + 1.0);
    sources.push(n);
  };
  const tom = (f: number) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f, when);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, when + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + 0.35);
    sources.push(o);
  };

  switch (pitch) {
    case 35:
    case 36: kick(); break;
    case 37:
    case 38:
    case 40: snare(); break;
    case 39: clap(); break;
    case 42:
    case 44: hat(false); break;
    case 46: hat(true); break;
    case 49:
    case 57: crash(); break;
    case 45:
    case 41: tom(110); break;
    case 47:
    case 48: tom(160); break;
    case 50:
    case 43: tom(220); break;
    default:
      // Fallback: pitch < 38 → kick, < 46 → snare, else hat.
      if (pitch <= 37) kick();
      else if (pitch <= 45) snare();
      else hat(false);
  }
  return sources;
}

/** Standard drum-map pitches used by the composer / drum grid UI. */
export const DRUM_MAP = {
  kick: 36,
  snare: 38,
  clap: 39,
  hatClosed: 42,
  hatOpen: 46,
  crash: 49,
  tomLow: 45,
  tomMid: 47,
  tomHigh: 50,
} as const;

export const DRUM_LANES: { id: keyof typeof DRUM_MAP; label: string; pitch: number }[] = [
  { id: "kick", label: "Kick", pitch: DRUM_MAP.kick },
  { id: "snare", label: "Snare", pitch: DRUM_MAP.snare },
  { id: "clap", label: "Clap", pitch: DRUM_MAP.clap },
  { id: "hatClosed", label: "Hat", pitch: DRUM_MAP.hatClosed },
  { id: "hatOpen", label: "Open Hat", pitch: DRUM_MAP.hatOpen },
  { id: "crash", label: "Crash", pitch: DRUM_MAP.crash },
];
