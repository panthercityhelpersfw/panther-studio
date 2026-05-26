import type { AutomationLane, Clip, InstrumentId, Project } from "../state/types";
import { EffectChain } from "./effects/EffectChain";
import type { EffectsState } from "./effects/types";
import { scheduleInstrumentNote } from "./instruments";

/** Per-track Web Audio node chain. */
interface TrackNodes {
  /** Chain input: clip sources and (wet) monitoring connect here. */
  input: GainNode;
  fx: EffectChain;
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  scratch: Float32Array<ArrayBuffer>;
}

interface InputChain {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  /** Dry monitor path: input -> monitorGain -> master (no effects). */
  monitorGain: GainNode;
  /** Wet monitor path: input -> monitorWet -> selected track fx input. */
  monitorWet: GainNode;
  recDest: MediaStreamAudioDestinationNode;
  scratch: Float32Array<ArrayBuffer>;
  freqScratch: Float32Array<ArrayBuffer>;
  deviceId: string | null;
}

export interface MeterSnapshot {
  master: { l: number; r: number };
  tracks: Record<string, number>;
  /** Gain reduction (dB, <= 0) per track from compressor + limiter. */
  reduction: Record<string, { comp: number; limiter: number }>;
  /** Master chain gain reduction (dB, <= 0). */
  masterReduction: { comp: number; limiter: number };
  input: number;
}

type MeterCb = (m: MeterSnapshot) => void;
type PositionCb = (sec: number) => void;
type EndedCb = () => void;

function automationValueAt(lane: AutomationLane | undefined, timeSec: number, fallback: number): number {
  if (!lane || !lane.enabled || lane.points.length === 0) return fallback;
  const points = [...lane.points].sort((a, b) => a.timeSec - b.timeSec);
  if (timeSec <= points[0].timeSec) return points[0].value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const t = (timeSec - a.timeSec) / Math.max(0.0001, b.timeSec - a.timeSec);
      return a.value + (b.value - a.value) * t;
    }
  }
  return points[points.length - 1].value;
}

function scheduleAutomation(param: AudioParam, lane: AutomationLane | undefined, positionSec: number, ctxTime: number, fallback: number) {
  if (!lane || !lane.enabled || lane.points.length === 0) {
    param.setValueAtTime(fallback, ctxTime);
    return;
  }
  param.cancelScheduledValues(ctxTime);
  param.setValueAtTime(automationValueAt(lane, positionSec, fallback), ctxTime);
  for (const point of [...lane.points].sort((a, b) => a.timeSec - b.timeSec)) {
    if (point.timeSec < positionSec) continue;
    param.linearRampToValueAtTime(point.value, ctxTime + point.timeSec - positionSec);
  }
}

/**
 * Singleton real-time audio engine built on the Web Audio API.
 *
 * Graph:
 *   [clip sources] -> trackGain -> trackPanner -> trackAnalyser -> master
 *   input mic       -> inputGain -> (inputAnalyser, monitorGain->master, recDest->MediaRecorder)
 *   master          -> destination  (and -> splitter -> L/R analysers for the master meter)
 *
 * Nothing here is faked: clips are scheduled AudioBufferSourceNodes, metering
 * reads real AnalyserNode data, and recording captures the gain-applied mic
 * stream through a MediaStreamAudioDestinationNode.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  // `master` is the SUM bus: all tracks, pads, and dry monitor connect here.
  private master!: GainNode;
  // Master processing chain (reused EffectChain) with bypass + output gain.
  private masterChain!: EffectChain;
  private masterDry!: GainNode;
  private masterWet!: GainNode;
  private masterOut!: GainNode; // output gain, feeds destination + meters
  private masterSplitter!: ChannelSplitterNode;
  private masterAnalyserL!: AnalyserNode;
  private masterAnalyserR!: AnalyserNode;
  private masterScratchL!: Float32Array<ArrayBuffer>;
  private masterScratchR!: Float32Array<ArrayBuffer>;

  private tracks = new Map<string, TrackNodes>();
  private buffers = new Map<string, AudioBuffer>();
  // Holds buffer sources AND midi oscillators scheduled for the current play.
  private activeSources = new Set<AudioScheduledSourceNode>();
  // One-shot pad voices (not stopped by transport stop).
  private padVoices = new Set<AudioScheduledSourceNode>();
  private padBus: GainNode | null = null;

  // Reference A/B: reference audio routes direct to destination (post-master).
  private refSource: AudioBufferSourceNode | null = null;
  private refGain: GainNode | null = null;

  private input: InputChain | null = null;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private recMime = "";

  // Transport timing.
  private playing = false;
  private playStartCtxTime = 0;
  private playStartPos = 0;
  private projectLength = 0;

  // Loop region (handled in the meter loop). The loop *start* is owned by the
  // store, which reseeks on the onLoop callback; the engine only needs the end.
  private loopEnabled = false;
  private loopEnd = 0;
  private loopCb: (() => void) | null = null;

  // Metronome (click scheduler, lookahead in the meter loop).
  private metronomeEnabled = false;
  private tempo = 120;
  private nextClickTime = 0;
  private nextClickBeat = 0;

  // Performance.
  private lowCpu = false;
  private frameCounter = 0;

  private rafId: number | null = null;
  private meterCb: MeterCb | null = null;
  private positionCb: PositionCb | null = null;
  private endedCb: EndedCb | null = null;
  private inputEndedCb: (() => void) | null = null;

  // Monitoring.
  private monitorEnabled = false;
  private monitorMode: "dry" | "wet" = "dry";
  private monitorTrackId: string | null = null;

  // ---- Lifecycle ----

  /** Lazily create the AudioContext (must be called from a user gesture). */
  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });

      // Master sum bus (unity); output gain lives on masterOut.
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;

      // Master processing chain with a dry/wet bypass.
      this.masterChain = new EffectChain(this.ctx);
      this.masterDry = this.ctx.createGain();
      this.masterWet = this.ctx.createGain();
      this.masterOut = this.ctx.createGain();
      this.masterOut.gain.value = 1;
      // sum -> dry -> out  AND  sum -> chain -> wet -> out
      this.master.connect(this.masterDry);
      this.masterDry.connect(this.masterOut);
      this.master.connect(this.masterChain.input);
      this.masterChain.output.connect(this.masterWet);
      this.masterWet.connect(this.masterOut);
      // Default: master chain engaged (dry muted).
      this.masterDry.gain.value = 0;
      this.masterWet.gain.value = 1;

      this.masterSplitter = this.ctx.createChannelSplitter(2);
      this.masterAnalyserL = this.ctx.createAnalyser();
      this.masterAnalyserR = this.ctx.createAnalyser();
      this.masterAnalyserL.fftSize = 1024;
      this.masterAnalyserR.fftSize = 1024;
      this.masterScratchL = new Float32Array(this.masterAnalyserL.fftSize);
      this.masterScratchR = new Float32Array(this.masterAnalyserR.fftSize);

      // Meters + output read post-master-chain (true output levels).
      this.masterOut.connect(this.ctx.destination);
      this.masterOut.connect(this.masterSplitter);
      this.masterSplitter.connect(this.masterAnalyserL, 0);
      this.masterSplitter.connect(this.masterAnalyserR, 1);

      // Sample-pad bus routes one-shots through the master bus.
      this.padBus = this.ctx.createGain();
      this.padBus.gain.value = 1;
      this.padBus.connect(this.master);

      this.startMeterLoop();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  async suspend() {
    if (this.ctx && this.ctx.state === "running" && !this.playing) {
      await this.ctx.suspend();
    }
  }

  setMasterGain(g: number) {
    if (this.masterOut) this.masterOut.gain.value = g;
  }

  /** Route playback to a specific output device where supported (AudioContext.
   *  setSinkId; Chromium/WebView2). Returns true if the sink was changed. */
  async setOutputDevice(deviceId: string): Promise<boolean> {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!ctx || typeof ctx.setSinkId !== "function") return false;
    try {
      await ctx.setSinkId(deviceId === "default" ? "" : deviceId);
      return true;
    } catch {
      return false;
    }
  }

  /** Whether selecting an output device is supported in this runtime. */
  supportsOutputSelection(): boolean {
    const ctx = this.ctx as (AudioContext & { setSinkId?: unknown }) | null;
    return !!ctx && typeof ctx.setSinkId === "function";
  }

  /** Play a short test tone (for headphone/output testing). */
  playTestTone(freq = 440, durSec = 0.6, gain = 0.2) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.setValueAtTime(gain, t + durSec - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durSec);
    osc.connect(g);
    g.connect(this.masterOut ?? ctx.destination);
    osc.start(t);
    osc.stop(t + durSec + 0.02);
  }

  /** True (unscaled) input RMS for noise-floor / room-noise measurement. */
  inputRms(): number {
    if (!this.input) return 0;
    const buf = this.input.scratch;
    this.input.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  /** Raw input peak (0..1) for plosive / clip detection during calibration. */
  inputPeak(): number {
    if (!this.input) return 0;
    const buf = this.input.scratch;
    this.input.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  inputAnalysisFrame() {
    if (!this.input || !this.ctx) return null;
    const time = this.input.scratch;
    const freq = this.input.freqScratch;
    this.input.analyser.getFloatTimeDomainData(time);
    this.input.analyser.getFloatFrequencyData(freq);
    let rms = 0;
    let peak = 0;
    let zcr = 0;
    for (let i = 0; i < time.length; i++) {
      const v = time[i];
      rms += v * v;
      peak = Math.max(peak, Math.abs(v));
      if (i > 0 && Math.sign(v) !== Math.sign(time[i - 1])) zcr++;
    }
    rms = Math.sqrt(rms / time.length);
    zcr /= Math.max(1, time.length - 1);
    const nyquist = this.ctx.sampleRate / 2;
    let total = 0;
    let weighted = 0;
    let low = 0;
    let lowMid = 0;
    let presence = 0;
    let high = 0;
    for (let i = 0; i < freq.length; i++) {
      const hz = (i / Math.max(1, freq.length - 1)) * nyquist;
      const mag = Math.pow(10, freq[i] / 20);
      total += mag;
      weighted += hz * mag;
      if (hz < 180) low += mag;
      else if (hz < 520) lowMid += mag;
      else if (hz >= 3000 && hz < 7000) presence += mag;
      else if (hz >= 7000) high += mag;
    }
    const energy = Math.max(total, 1e-8);
    return {
      sampleRate: this.ctx.sampleRate,
      timeSec: this.currentPosition(),
      rms,
      peak,
      zcr,
      pitchHz: this.detectPitch(),
      spectralCentroid: weighted / energy,
      lowRatio: low / energy,
      lowMidRatio: lowMid / energy,
      presenceRatio: presence / energy,
      highRatio: high / energy,
      active: this.playing,
    };
  }

  /** Apply the master processing chain settings (EQ/comp/sat/limiter…). */
  setMasterChain(state: EffectsState) {
    if (this.masterChain) this.masterChain.apply(state);
  }

  /** Bypass routes the sum straight to output (chain still exists, just unused). */
  setMasterBypass(bypass: boolean) {
    if (!this.masterDry) return;
    this.masterDry.gain.value = bypass ? 1 : 0;
    this.masterWet.gain.value = bypass ? 0 : 1;
  }

  getMasterReduction(): { comp: number; limiter: number } {
    return this.masterChain ? this.masterChain.getReduction() : { comp: 0, limiter: 0 };
  }

  /** Fill `out` with the master bus FFT magnitudes (0..255). Returns false if
   *  the context isn't ready. Used by the spectrum analyzer. */
  getMasterFrequencyData(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.masterAnalyserL) return false;
    this.masterAnalyserL.getByteFrequencyData(out);
    return true;
  }

  masterBinCount(): number {
    return this.masterAnalyserL ? this.masterAnalyserL.frequencyBinCount : 0;
  }

  // ---- Tracks ----

  ensureTrack(id: string): TrackNodes {
    if (!this.ctx) throw new Error("AudioContext not ready");
    let t = this.tracks.get(id);
    if (!t) {
      const input = this.ctx.createGain();
      const fx = new EffectChain(this.ctx);
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      // clip sources -> input -> fx -> gain(fader) -> pan -> analyser -> master
      input.connect(fx.input);
      fx.output.connect(gain);
      gain.connect(panner);
      panner.connect(analyser);
      analyser.connect(this.master);
      t = {
        input,
        fx,
        gain,
        panner,
        analyser,
        scratch: new Float32Array(analyser.fftSize),
      };
      this.tracks.set(id, t);
    }
    return t;
  }

  removeTrack(id: string) {
    const t = this.tracks.get(id);
    if (t) {
      if (this.monitorTrackId === id) this.routeMonitorToTrack(null);
      t.input.disconnect();
      t.fx.dispose();
      t.gain.disconnect();
      t.panner.disconnect();
      t.analyser.disconnect();
      this.tracks.delete(id);
    }
  }

  /** `effectiveGain` already accounts for mute/solo; 0 silences the track. */
  applyTrackParams(id: string, effectiveGain: number, pan: number) {
    const t = this.ensureTrack(id);
    t.gain.gain.value = effectiveGain;
    t.panner.pan.value = Math.max(-1, Math.min(1, pan));
  }

  /** Push a track's effect-chain settings into its live Web Audio graph. */
  applyEffects(id: string, state: EffectsState) {
    const t = this.ensureTrack(id);
    t.fx.apply(state);
  }

  /** Reconcile live track nodes with the given set of track ids (undo/redo). */
  syncTracks(ids: string[]) {
    if (!this.ctx) return;
    const want = new Set(ids);
    for (const id of [...this.tracks.keys()]) {
      if (!want.has(id)) this.removeTrack(id);
    }
    for (const id of ids) this.ensureTrack(id);
  }

  // ---- Buffers ----

  registerBuffer(assetId: string, buffer: AudioBuffer) {
    this.buffers.set(assetId, buffer);
  }

  hasBuffer(assetId: string) {
    return this.buffers.has(assetId);
  }

  getBuffer(assetId: string) {
    return this.buffers.get(assetId);
  }

  async decodeBlob(blob: Blob): Promise<AudioBuffer> {
    const ctx = await this.ensure();
    const arr = await blob.arrayBuffer();
    // decodeAudioData detaches the buffer, so pass a copy-safe slice.
    return await ctx.decodeAudioData(arr);
  }

  // ---- Transport / playback ----

  isPlaying() {
    return this.playing;
  }

  /** Schedule all clips for playback starting at `positionSec`. */
  async play(positionSec: number, project: Project, audibleGain: (trackId: string) => number) {
    const ctx = await this.ensure();
    this.stopSources();
    this.projectLength = Math.max(project.lengthSec, this.computeLength(project));

    this.playStartCtxTime = ctx.currentTime;
    this.playStartPos = positionSec;
    this.playing = true;
    scheduleAutomation(
      this.masterOut.gain,
      project.automation?.find((l) => l.target === "master.volume"),
      positionSec,
      ctx.currentTime,
      project.masterGain
    );

    for (const clip of project.clips) {
      if (clip.muted) continue;
      const clipEnd = clip.startSec + clip.durationSec;
      if (clipEnd <= positionSec) continue;

      this.ensureTrack(clip.trackId);
      const trackNodes = this.tracks.get(clip.trackId)!;
      // Apply current audible gain so muted/soloed state is respected.
      const track = project.tracks.find((t) => t.id === clip.trackId);
      const volLane = project.automation?.find((l) => l.trackId === clip.trackId && l.target === "track.volume");
      const panLane = project.automation?.find((l) => l.trackId === clip.trackId && l.target === "track.pan");
      scheduleAutomation(trackNodes.gain.gain, volLane, positionSec, ctx.currentTime, audibleGain(clip.trackId));
      scheduleAutomation(trackNodes.panner.pan, panLane, positionSec, ctx.currentTime, track?.pan ?? 0);

      if (clip.kind === "midi") {
        this.scheduleMidiClip(ctx, clip, positionSec, trackNodes.input, track?.instrument ?? "synth");
        continue;
      }

      const buffer = this.buffers.get(clip.assetId);
      if (!buffer) continue;

      const offsetIntoClip = Math.max(0, positionSec - clip.startSec);
      const when = ctx.currentTime + Math.max(0, clip.startSec - positionSec);
      const bufferOffset = clip.offsetSec + offsetIntoClip;
      const playDur = Math.max(0, clip.durationSec - offsetIntoClip);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // Per-clip gain node carries clip gain + fade envelopes.
      const clipGain = ctx.createGain();
      this.applyClipEnvelope(clipGain, clip, offsetIntoClip, when, playDur);
      src.connect(clipGain);
      clipGain.connect(trackNodes.input);

      try {
        src.start(when, bufferOffset, playDur);
      } catch {
        continue;
      }
      this.activeSources.add(src);
      src.onended = () => {
        this.activeSources.delete(src);
        try {
          src.disconnect();
          clipGain.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    }
  }

  /** Schedule clip gain + fade-in/out on the per-clip gain node. */
  private applyClipEnvelope(
    g: GainNode,
    clip: Clip,
    offsetIntoClip: number,
    when: number,
    playDur: number
  ) {
    const base = clip.gain ?? 1;
    const fi = clip.fadeInSec ?? 0;
    const fo = clip.fadeOutSec ?? 0;
    const param = g.gain;
    param.cancelScheduledValues(when);

    // Fade in (account for starting partway into the clip).
    if (fi > 0 && offsetIntoClip < fi) {
      const remain = fi - offsetIntoClip;
      const startLevel = base * (offsetIntoClip / fi);
      param.setValueAtTime(Math.max(0.0001, startLevel), when);
      param.linearRampToValueAtTime(base, when + remain);
    } else {
      param.setValueAtTime(base, when);
    }

    // Fade out over the final `fo` seconds of the played region.
    if (fo > 0 && playDur > 0) {
      const foStart = Math.max(0, playDur - fo);
      param.setValueAtTime(base, when + foStart);
      param.linearRampToValueAtTime(0.0001, when + playDur);
    }
  }

  /** Schedule a MIDI clip's notes as simple synth voices through the track chain. */
  private scheduleMidiClip(
    ctx: AudioContext,
    clip: Clip,
    positionSec: number,
    dest: AudioNode,
    instrument: InstrumentId
  ) {
    const notes = clip.notes ?? [];
    for (const note of notes) {
      const noteStartAbs = clip.startSec + note.startSec;
      const noteEndAbs = noteStartAbs + note.durationSec;
      if (noteEndAbs <= positionSec) continue;
      // Clip notes to the clip's own duration window.
      if (note.startSec >= clip.durationSec) continue;

      const startFromNow = Math.max(0, noteStartAbs - positionSec);
      const when = ctx.currentTime + startFromNow;
      const dur = Math.min(noteEndAbs, clip.startSec + clip.durationSec) - Math.max(noteStartAbs, positionSec);
      if (dur <= 0) continue;
      const sources = scheduleInstrumentNote(ctx, instrument, note, when, dur, dest);
      for (const src of sources) {
        this.activeSources.add(src);
        src.onended = () => {
          this.activeSources.delete(src);
          try {
            src.disconnect();
          } catch {
            /* ignore */
          }
        };
      }
    }
  }

  /** Preview a single instrument note (used by the piano roll / instrument picker). */
  previewNote(instrument: InstrumentId, pitch: number, velocity = 0.85, dur = 0.5) {
    if (!this.ctx) return;
    const sources = scheduleInstrumentNote(
      this.ctx,
      instrument,
      { pitch, velocity },
      this.ctx.currentTime + 0.01,
      dur,
      this.master
    );
    for (const src of sources) {
      this.padVoices.add(src);
      src.onended = () => {
        this.padVoices.delete(src);
        try {
          src.disconnect();
        } catch {
          /* ignore */
        }
      };
    }
  }

  /** Trigger a one-shot sample (sample pad / preview). Routed via the pad bus. */
  playSample(buffer: AudioBuffer, gain = 1) {
    if (!this.ctx || !this.padBus) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.padBus);
    src.start();
    this.padVoices.add(src);
    src.onended = () => {
      this.padVoices.delete(src);
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  // ---- Reference A/B ----

  /** Play the reference track from `positionSec`, routed straight to the output
   *  (bypassing the master chain), for honest A/B comparison. */
  playReference(buffer: AudioBuffer, positionSec: number, gain: number) {
    if (!this.ctx) return;
    this.stopReference();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    const offset = Math.max(0, Math.min(positionSec, buffer.duration - 0.001));
    try {
      src.start(0, offset);
    } catch {
      return;
    }
    this.refSource = src;
    this.refGain = g;
  }

  stopReference() {
    if (this.refSource) {
      try {
        this.refSource.stop();
        this.refSource.disconnect();
      } catch {
        /* ignore */
      }
      this.refSource = null;
    }
    if (this.refGain) {
      try {
        this.refGain.disconnect();
      } catch {
        /* ignore */
      }
      this.refGain = null;
    }
  }

  setReferenceGain(gain: number) {
    if (this.refGain) this.refGain.gain.value = gain;
  }

  // ---- Loop ----

  setLoop(enabled: boolean, startSec: number, endSec: number) {
    this.loopEnabled = enabled && endSec > startSec;
    this.loopEnd = endSec;
  }

  onLoop(cb: () => void) {
    this.loopCb = cb;
  }

  // ---- Metronome / count-in ----

  setMetronome(enabled: boolean, tempo: number) {
    this.metronomeEnabled = enabled;
    this.tempo = tempo;
  }

  setTempo(tempo: number) {
    this.tempo = tempo;
  }

  /** Schedule a single click at audio time `when`. Routed direct to output so
   *  it is heard but never recorded or exported. */
  private playClick(when: number, accent: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  /** Play `bars` bars of count-in clicks; resolves when the count-in finishes. */
  async countIn(bars: number, tempo: number): Promise<void> {
    const ctx = await this.ensure();
    const beat = 60 / tempo;
    const beats = Math.max(1, Math.round(bars * 4));
    const start = ctx.currentTime + 0.12;
    for (let i = 0; i < beats; i++) {
      this.playClick(start + i * beat, i % 4 === 0);
    }
    const totalMs = (beats * beat + 0.12) * 1000;
    await new Promise((r) => setTimeout(r, totalMs));
  }

  /** Lookahead metronome scheduling, called from the meter loop while playing. */
  private scheduleMetronome() {
    if (!this.ctx || !this.metronomeEnabled || !this.playing) return;
    const beat = 60 / this.tempo;
    const ahead = 0.2;
    const now = this.ctx.currentTime;
    // Initialise from the current transport position on first call.
    if (this.nextClickTime < now) {
      const pos = this.currentPosition();
      this.nextClickBeat = Math.ceil(pos / beat);
      this.nextClickTime = now + (this.nextClickBeat * beat - pos);
    }
    while (this.nextClickTime < now + ahead) {
      this.playClick(this.nextClickTime, this.nextClickBeat % 4 === 0);
      this.nextClickBeat++;
      this.nextClickTime += beat;
    }
  }

  // ---- Tuner (autocorrelation pitch detection on the mic input) ----

  detectPitch(): number | null {
    if (!this.input || !this.ctx) return null;
    const buf = this.input.scratch;
    this.input.analyser.getFloatTimeDomainData(buf);
    const sr = this.ctx.sampleRate;
    const size = buf.length;

    // RMS gate: ignore silence.
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return null;

    let bestOffset = -1;
    let bestCorr = 0;
    let lastCorr = 1;
    const maxOffset = Math.floor(size / 2);
    for (let offset = 8; offset < maxOffset; offset++) {
      let corr = 0;
      for (let i = 0; i < maxOffset; i++) corr += buf[i] * buf[i + offset];
      corr /= maxOffset;
      if (corr > 0.9 && corr > lastCorr && corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
      lastCorr = corr;
    }
    if (bestOffset > 0 && bestCorr > 0.01) {
      const freq = sr / bestOffset;
      if (freq >= 50 && freq <= 2000) return freq;
    }
    return null;
  }

  // ---- Performance ----

  setLowCpu(on: boolean) {
    this.lowCpu = on;
  }

  getPerfInfo() {
    return {
      sampleRate: this.ctx?.sampleRate ?? 0,
      baseLatencyMs: this.ctx ? Math.round((this.ctx.baseLatency || 0) * 1000) : 0,
      activeVoices: this.activeSources.size,
      trackCount: this.tracks.size,
      contextState: this.ctx?.state ?? "none",
    };
  }

  stop() {
    this.playing = false;
    this.stopSources();
    this.stopReference();
    this.nextClickTime = 0;
  }

  private stopSources() {
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.activeSources.clear();
  }

  currentPosition(): number {
    if (!this.ctx || !this.playing) return this.playStartPos;
    return this.playStartPos + (this.ctx.currentTime - this.playStartCtxTime);
  }

  setPlayheadAnchor(sec: number) {
    this.playStartPos = sec;
    if (this.ctx) this.playStartCtxTime = this.ctx.currentTime;
  }

  private computeLength(project: Project): number {
    let max = 0;
    for (const c of project.clips) max = Math.max(max, c.startSec + c.durationSec);
    return max;
  }

  // ---- Input / mic ----

  async listInputDevices(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput");
  }

  async openInput(deviceId: string | null, inputGain: number): Promise<void> {
    const ctx = await this.ensure();
    this.closeInput();

    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        : {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
      video: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Detect the device being unplugged / lost mid-session.
    const micTrack = stream.getAudioTracks()[0];
    if (micTrack) {
      micTrack.onended = () => {
        this.inputEndedCb?.();
      };
    }
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = inputGain;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = 0; // monitoring off by default (feedback safety)
    const monitorWet = ctx.createGain();
    monitorWet.gain.value = 0;
    const recDest = ctx.createMediaStreamDestination();

    source.connect(gain);
    gain.connect(analyser);
    gain.connect(monitorGain);
    monitorGain.connect(this.master);
    gain.connect(monitorWet); // routed to a track's fx input on demand
    // recDest always taps the dry, gain-applied signal so recordings stay clean
    // (effects are non-destructive and applied on playback only).
    gain.connect(recDest);

    this.input = {
      stream,
      source,
      gain,
      analyser,
      monitorGain,
      monitorWet,
      recDest,
      scratch: new Float32Array(analyser.fftSize),
      freqScratch: new Float32Array(analyser.frequencyBinCount),
      deviceId,
    };
    this.applyMonitorRouting();
  }

  closeInput() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.recorder = null;
    if (this.input) {
      this.input.stream.getTracks().forEach((t) => t.stop());
      try {
        this.input.source.disconnect();
        this.input.gain.disconnect();
        this.input.monitorGain.disconnect();
        this.input.monitorWet.disconnect();
      } catch {
        /* ignore */
      }
      this.input = null;
    }
  }

  hasInput() {
    return !!this.input;
  }

  currentInputDeviceId() {
    return this.input?.deviceId ?? null;
  }

  setInputGain(g: number) {
    if (this.input) this.input.gain.gain.value = g;
  }

  setMonitor(on: boolean) {
    this.monitorEnabled = on;
    this.applyMonitorRouting();
  }

  setMonitorMode(mode: "dry" | "wet") {
    this.monitorMode = mode;
    this.applyMonitorRouting();
  }

  getMonitorMode() {
    return this.monitorMode;
  }

  /** Choose which track's effect chain the wet monitor feeds. */
  routeMonitorToTrack(trackId: string | null) {
    if (this.monitorTrackId === trackId) {
      this.applyMonitorRouting();
      return;
    }
    // Disconnect previous wet routing.
    if (this.input && this.monitorTrackId) {
      const prev = this.tracks.get(this.monitorTrackId);
      if (prev) {
        try {
          this.input.monitorWet.disconnect(prev.input);
        } catch {
          /* ignore */
        }
      }
    }
    this.monitorTrackId = trackId;
    this.applyMonitorRouting();
  }

  private applyMonitorRouting() {
    if (!this.input) return;
    const wet = this.monitorEnabled && this.monitorMode === "wet";
    const dry = this.monitorEnabled && this.monitorMode === "dry";

    this.input.monitorGain.gain.value = dry ? 1 : 0;

    // Connect the wet tap to the selected track's fx input (once).
    if (this.monitorTrackId) {
      const t = this.tracks.get(this.monitorTrackId);
      if (t) {
        try {
          this.input.monitorWet.connect(t.input);
        } catch {
          /* already connected */
        }
      }
    }
    this.input.monitorWet.gain.value = wet && this.monitorTrackId ? 1 : 0;
  }

  // ---- Recording ----

  private pickMime(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return "";
  }

  startRecording() {
    if (!this.input) throw new Error("No input open");
    this.recMime = this.pickMime();
    this.recChunks = [];
    this.recorder = this.recMime
      ? new MediaRecorder(this.input.recDest.stream, { mimeType: this.recMime })
      : new MediaRecorder(this.input.recDest.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recChunks.push(e.data);
    };
    this.recorder.start(250);
  }

  async stopRecording(): Promise<{ blob: Blob; mime: string } | null> {
    const rec = this.recorder;
    if (!rec) return null;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const mime = this.recMime || rec.mimeType || "audio/webm";
        const blob = new Blob(this.recChunks, { type: mime });
        this.recChunks = [];
        this.recorder = null;
        resolve(blob.size > 0 ? { blob, mime } : null);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  // ---- Meter loop ----

  onMeter(cb: MeterCb) {
    this.meterCb = cb;
  }
  onPosition(cb: PositionCb) {
    this.positionCb = cb;
  }
  onEnded(cb: EndedCb) {
    this.endedCb = cb;
  }
  onInputEnded(cb: () => void) {
    this.inputEndedCb = cb;
  }

  private rms(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
    analyser.getFloatTimeDomainData(scratch);
    let sum = 0;
    for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
    const rms = Math.sqrt(sum / scratch.length);
    // Map to a perceptual-ish 0..1 with light compression.
    return Math.min(1, rms * 2.2);
  }

  private startMeterLoop() {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.ctx) return;

      // Metronome must stay accurate even in low-CPU mode (cheap lookahead).
      this.scheduleMetronome();

      // Low-CPU mode: run gates/meters at ~1/3 rate to cut work.
      this.frameCounter++;
      if (this.lowCpu && this.frameCounter % 3 !== 0) {
        if (this.playing) this.advanceTransport();
        return;
      }

      // Run the envelope-follower gates (tracks + master).
      for (const t of this.tracks.values()) t.fx.updateDynamics();
      this.masterChain?.updateDynamics();

      if (this.meterCb) {
        const tracks: Record<string, number> = {};
        const reduction: Record<string, { comp: number; limiter: number }> = {};
        for (const [id, t] of this.tracks) {
          tracks[id] = this.rms(t.analyser, t.scratch);
          reduction[id] = t.fx.getReduction();
        }
        const snapshot: MeterSnapshot = {
          master: {
            l: this.rms(this.masterAnalyserL, this.masterScratchL),
            r: this.rms(this.masterAnalyserR, this.masterScratchR),
          },
          tracks,
          reduction,
          masterReduction: this.masterChain.getReduction(),
          input: this.input ? this.rms(this.input.analyser, this.input.scratch) : 0,
        };
        this.meterCb(snapshot);
      }

      if (this.playing) this.advanceTransport();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Update playhead position, handle looping and end-of-song. */
  private advanceTransport() {
    const pos = this.currentPosition();
    if (this.loopEnabled && pos >= this.loopEnd) {
      this.loopCb?.();
      return;
    }
    if (this.positionCb) this.positionCb(pos);
    if (!this.loopEnabled && this.projectLength > 0 && pos >= this.projectLength + 0.25) {
      this.playing = false;
      this.stopSources();
      this.endedCb?.();
    }
  }

  dispose() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.stopSources();
    for (const v of this.padVoices) {
      try {
        v.stop();
        v.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.padVoices.clear();
    this.closeInput();
    if (this.ctx) this.ctx.close();
  }
}

export const audioEngine = new AudioEngine();
