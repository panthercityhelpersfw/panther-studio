import type { AutomationLane, Bus, Clip, Project } from "../state/types";
import { EffectChain } from "./effects/EffectChain";
import { scheduleInstrumentNote } from "./instruments";
import lamejs from "@breezystack/lamejs";

function busFactor(buses: Bus[] | undefined, busId: string | null | undefined): number {
  if (!busId || !buses) return 1;
  const b = buses.find((x) => x.id === busId);
  if (!b) return 1;
  return b.muted ? 0 : b.gain * (b.returnGain ?? 1);
}

function automationValueAt(lane: AutomationLane | undefined, timeSec: number, fallback: number): number {
  if (!lane || !lane.enabled || lane.points.length === 0) return fallback;
  const points = [...lane.points].sort((a, b) => a.timeSec - b.timeSec);
  if (timeSec <= points[0].timeSec) return points[0].value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const pos = (timeSec - a.timeSec) / Math.max(0.0001, b.timeSec - a.timeSec);
      return a.value + (b.value - a.value) * pos;
    }
  }
  return points[points.length - 1].value;
}

function scheduleAutomation(param: AudioParam, lane: AutomationLane | undefined, start: number, end: number, fallback: number, offset = 0) {
  if (!lane || !lane.enabled || lane.points.length === 0) {
    param.setValueAtTime(fallback, 0);
    return;
  }
  param.cancelScheduledValues(0);
  param.setValueAtTime(automationValueAt(lane, start, fallback), 0);
  for (const point of [...lane.points].sort((a, b) => a.timeSec - b.timeSec)) {
    if (point.timeSec < start || point.timeSec > end) continue;
    param.linearRampToValueAtTime(point.value, Math.max(0, point.timeSec - start + offset));
  }
}

type WavBitDepth = 16 | 24;

function clipSample(s: number) {
  return Math.max(-1, Math.min(1, s));
}

/** Encode an AudioBuffer into a PCM WAV Blob. */
export function encodeWav(buffer: AudioBuffer, opts: { bitDepth?: WavBitDepth } = {}): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bitDepth = opts.bitDepth ?? 16;
  const bytesPerSample = bitDepth === 24 ? 3 : 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = clipSample(channels[c][i]);
      if (bitDepth === 24) {
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      } else {
        const v = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
        view.setInt16(offset, v, true);
        offset += 2;
      }
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function toInt16(data: Float32Array, start: number, end: number): Int16Array {
  const out = new Int16Array(end - start);
  for (let i = start; i < end; i++) {
    const s = clipSample(data[i] || 0);
    out[i - start] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Encode an AudioBuffer into an MP3 Blob using a pure JS encoder. */
export function encodeMp3(buffer: AudioBuffer, kbps = 192): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new lamejs.Mp3Encoder(channels, buffer.sampleRate, kbps);
  const chunks: ArrayBuffer[] = [];
  const block = 1152;
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : null;

  for (let i = 0; i < buffer.length; i += block) {
    const end = Math.min(buffer.length, i + block);
    const mp3buf = right
      ? encoder.encodeBuffer(toInt16(left, i, end), toInt16(right, i, end))
      : encoder.encodeBuffer(toInt16(left, i, end));
    if (mp3buf.length) chunks.push(mp3buf.buffer.slice(mp3buf.byteOffset, mp3buf.byteOffset + mp3buf.byteLength) as ArrayBuffer);
  }
  const flush = encoder.flush();
  if (flush.length) chunks.push(flush.buffer.slice(flush.byteOffset, flush.byteOffset + flush.byteLength) as ArrayBuffer);
  return new Blob(chunks, { type: "audio/mpeg" });
}

interface RenderOpts {
  startSec?: number;
  endSec?: number;
  includeMaster?: boolean;
  /** If set, only these track ids are rendered (for stems). */
  trackIds?: string[];
  /** Ignore solo (used for stems so each stem renders in isolation). */
  ignoreSolo?: boolean;
  sampleRate?: number;
}

/** Schedule clip gain + fades on a per-clip gain node, region-aware. */
function applyFades(
  g: GainNode,
  clip: Clip,
  when: number,
  offsetIntoClip: number,
  dur: number
) {
  const base = clip.gain ?? 1;
  const fi = clip.fadeInSec ?? 0;
  const fo = clip.fadeOutSec ?? 0;
  const p = g.gain;
  if (fi > 0 && offsetIntoClip < fi) {
    const remain = fi - offsetIntoClip;
    p.setValueAtTime(Math.max(0.0001, base * (offsetIntoClip / fi)), when);
    p.linearRampToValueAtTime(base, when + Math.min(remain, dur));
  } else {
    p.setValueAtTime(base, when);
  }
  if (fo > 0) {
    const foStartRel = clip.durationSec - fo; // relative to clip start
    const endRel = offsetIntoClip + dur;
    if (endRel > foStartRel) {
      const fadeFromWhen = when + Math.max(0, foStartRel - offsetIntoClip);
      p.setValueAtTime(base, fadeFromWhen);
      p.linearRampToValueAtTime(0.0001, when + dur);
    }
  }
}

/**
 * Core offline renderer. Sums tracks (each through its real EffectChain, gain &
 * pan) into the master chain (unless bypassed/excluded), honoring clip gain,
 * fades, mute, and the requested time region. Returns a stereo AudioBuffer.
 */
export async function renderProject(
  project: Project,
  getBuffer: (assetId: string) => AudioBuffer | undefined,
  opts: RenderOpts = {}
): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 48000;
  const songEnd = project.clips.reduce(
    (m, c) => Math.max(m, c.startSec + c.durationSec),
    0
  );
  const start = Math.max(0, opts.startSec ?? 0);
  const end = Math.max(start + 0.05, opts.endSec ?? songEnd);
  const length = end - start;
  const tail = opts.includeMaster === false ? 0.1 : 1.0; // reverb/limiter tail
  const frames = Math.ceil((length + tail) * sampleRate);
  const offline = new OfflineAudioContext(2, frames, sampleRate);

  const outGain = offline.createGain();
  const masterVolLane = project.automation?.find((l) => l.target === "master.volume");
  scheduleAutomation(outGain.gain, masterVolLane, start, end, project.masterGain);
  outGain.connect(offline.destination);

  let busInput: AudioNode = outGain;
  if (opts.includeMaster !== false && !project.master.bypass) {
    const mc = new EffectChain(offline);
    mc.apply(project.master.effects);
    mc.output.connect(outGain);
    busInput = mc.input;
  }

  const wantTracks = opts.trackIds ? new Set(opts.trackIds) : null;
  const anySolo = !opts.ignoreSolo && project.tracks.some((t) => t.soloed);
  const trackInputs = new Map<string, GainNode>();

  for (const track of project.tracks) {
    if (wantTracks && !wantTracks.has(track.id)) continue;
    const fx = new EffectChain(offline);
    const automatedEffects = JSON.parse(JSON.stringify(track.effects));
    for (const lane of project.automation ?? []) {
      if (!lane.enabled || lane.trackId !== track.id || !lane.target.startsWith("effect.")) continue;
      const [, effect, param] = lane.target.split(".");
      if (automatedEffects[effect] && param in automatedEffects[effect]) {
        automatedEffects[effect][param] = automationValueAt(lane, start, automatedEffects[effect][param]);
        automatedEffects[effect].enabled = true;
      }
    }
    fx.apply(automatedEffects);
    const gain = offline.createGain();
    const panner = offline.createStereoPanner();
    const baseAudible = track.muted ? 0 : anySolo && !track.soloed ? 0 : track.gain;
    const busGain = busFactor(project.buses, track.busId);
    const sendLift = Object.entries(track.sends ?? {}).reduce(
      (sum, [busId, send]) => sum + send.gain * 0.35 * busFactor(project.buses, busId),
      0
    );
    const audible = baseAudible * (busGain + sendLift);
    const volumeLane = project.automation?.find((l) => l.trackId === track.id && l.target === "track.volume");
    const panLane = project.automation?.find((l) => l.trackId === track.id && l.target === "track.pan");
    scheduleAutomation(gain.gain, volumeLane, start, end, audible * busGain);
    scheduleAutomation(panner.pan, panLane, start, end, track.pan);
    fx.output.connect(gain);
    gain.connect(panner);
    panner.connect(busInput);
    trackInputs.set(track.id, fx.input);
  }

  for (const clip of project.clips) {
    if (clip.muted) continue;
    const dest = trackInputs.get(clip.trackId);
    if (!dest) continue;

    // MIDI clips: synthesize each note through the track's instrument.
    if (clip.kind === "midi") {
      const track = project.tracks.find((t) => t.id === clip.trackId);
      const instrument = track?.instrument ?? "synth";
      for (const note of clip.notes ?? []) {
        const noteStartAbs = clip.startSec + note.startSec;
        const noteEndAbs = noteStartAbs + note.durationSec;
        if (note.startSec >= clip.durationSec) continue;
        if (noteEndAbs <= start || noteStartAbs >= end) continue;
        const when = Math.max(0, noteStartAbs - start);
        const noteDur = Math.min(noteEndAbs, clip.startSec + clip.durationSec) - noteStartAbs;
        if (noteDur <= 0) continue;
        scheduleInstrumentNote(offline, instrument, note, when, noteDur, dest);
      }
      continue;
    }

    const buffer = getBuffer(clip.assetId);
    if (!buffer) continue;
    const clipStart = clip.startSec;
    const clipEnd = clip.startSec + clip.durationSec;
    if (clipEnd <= start || clipStart >= end) continue;

    const playStartAbs = Math.max(clipStart, start);
    const playEndAbs = Math.min(clipEnd, end);
    const when = playStartAbs - start;
    const offsetIntoClip = playStartAbs - clipStart;
    const srcOffset = clip.offsetSec + offsetIntoClip;
    const dur = playEndAbs - playStartAbs;
    if (dur <= 0) continue;

    const src = offline.createBufferSource();
    src.buffer = buffer;
    const cg = offline.createGain();
    applyFades(cg, clip, when, offsetIntoClip, dur);
    src.connect(cg);
    cg.connect(dest);
    src.start(when, srcOffset, dur);
  }

  const rendered = await offline.startRendering();
  // Stereo width + low-end mono are applied to the finished master here (real
  // sample math), so exports and the export-safe preview reflect them exactly.
  if (opts.includeMaster !== false) {
    const widthLane = project.automation?.find((l) => l.target === "master.width");
    applyStereoMaster(rendered, automationValueAt(widthLane, start, project.stereoWidth ?? 1), project.monoBelowHz ?? 0);
  }
  return rendered;
}

/** One-pole low-pass (returns the low band of `x`). */
function lowBand(x: Float32Array, fc: number, fs: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / fs);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
}

/**
 * In-place stereo master shaping: keep low frequencies mono (below `monoBelowHz`)
 * and scale the stereo Side component of the high band by `width` (0 = mono,
 * 1 = unchanged, 2 = wide). Pure sample math — no plugins, fully deterministic.
 */
export function applyStereoMaster(buffer: AudioBuffer, width: number, monoBelowHz: number): void {
  if (buffer.numberOfChannels < 2) return;
  const widthOn = Math.abs(width - 1) > 0.001;
  const monoOn = monoBelowHz > 20;
  if (!widthOn && !monoOn) return;

  const fs = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const n = L.length;

  // Split into low (mono'd) + high (width-processed) bands.
  const lowL = monoOn ? lowBand(L, monoBelowHz, fs) : null;
  const lowR = monoOn ? lowBand(R, monoBelowHz, fs) : null;

  for (let i = 0; i < n; i++) {
    let hl = L[i];
    let hr = R[i];
    let lowMono = 0;
    if (lowL && lowR) {
      lowMono = (lowL[i] + lowR[i]) * 0.5;
      hl = L[i] - lowL[i];
      hr = R[i] - lowR[i];
    }
    if (widthOn) {
      const mid = (hl + hr) * 0.5;
      const side = (hl - hr) * 0.5 * width;
      hl = mid + side;
      hr = mid - side;
    }
    L[i] = lowMono + hl;
    R[i] = lowMono + hr;
  }
}

/** Full song through the master chain. */
export function renderMixdown(
  project: Project,
  getBuffer: (assetId: string) => AudioBuffer | undefined,
  sampleRate = 48000
): Promise<AudioBuffer> {
  return renderProject(project, getBuffer, { includeMaster: true, sampleRate });
}

/** A time region (e.g. the loop) through the master chain. */
export function renderRegion(
  project: Project,
  getBuffer: (assetId: string) => AudioBuffer | undefined,
  startSec: number,
  endSec: number,
  sampleRate = 48000
): Promise<AudioBuffer> {
  return renderProject(project, getBuffer, {
    startSec,
    endSec,
    includeMaster: true,
    sampleRate,
  });
}

/** A single track in isolation (its own chain, pre-master) — for stems. */
export function renderStem(
  project: Project,
  getBuffer: (assetId: string) => AudioBuffer | undefined,
  trackId: string,
  sampleRate = 48000
): Promise<AudioBuffer> {
  return renderProject(project, getBuffer, {
    trackIds: [trackId],
    includeMaster: false,
    ignoreSolo: true,
    sampleRate,
  });
}
