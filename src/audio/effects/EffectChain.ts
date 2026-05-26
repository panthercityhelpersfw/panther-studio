import { generateImpulse } from "./impulse";
import { dbToGain, type EffectsState } from "./types";

/**
 * One effect "slot": input -> dry -> output and input -> [process] -> wet ->
 * output. Topology is built ONCE and never reconnected; enable/bypass and
 * wet/dry are done purely by setting the dry/wet gains. This makes the chain
 * click-free and leak-free (no node churn on parameter changes).
 *
 *  - Insert effects (gate, eq, deEsser, compressor, limiter): enabled => wet=1,
 *    dry=0; bypassed => wet=0, dry=1.
 *  - Blend effects (saturation, doubler, delay, reverb): dry stays 1; wet = the
 *    mix amount when enabled, else 0 (parallel).
 */
interface Slot {
  input: GainNode;
  output: GainNode;
  dry: GainNode;
  wet: GainNode;
}

function makeSlot(ctx: BaseAudioContext): Slot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry);
  dry.connect(output);
  wet.connect(output);
  return { input, output, dry, wet };
}

function makeTanhCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.max(1, amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export class EffectChain {
  input: GainNode;
  output: GainNode;
  private ctx: BaseAudioContext;

  // Gate (envelope-follower driven from updateDynamics()).
  private gate: Slot;
  private gateGain: GainNode;
  private gateDetector: AnalyserNode;
  private gateBuf: Float32Array<ArrayBuffer>;
  private gateThreshLin = 0.003;
  private gateAttack = 0.005;
  private gateRelease = 0.12;
  private gateFloor = 0;
  private gateEnabled = false;
  private gateCurrent = 1;

  // EQ
  private eq: Slot;
  private hpf: BiquadFilterNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;

  // De-esser (split-band compressor)
  private deEsser: Slot;
  private deLow: BiquadFilterNode;
  private deHigh: BiquadFilterNode;
  private deComp: DynamicsCompressorNode;

  // Compressor
  private comp: Slot;
  private compressor: DynamicsCompressorNode;
  private compMakeup: GainNode;

  // Saturation
  private sat: Slot;
  private satPre: GainNode;
  private satShaper: WaveShaperNode;
  private satPost: GainNode;

  // Doubler / chorus
  private dbl: Slot;
  private dblDelayL: DelayNode;
  private dblDelayR: DelayNode;
  private dblPanL: StereoPannerNode;
  private dblPanR: StereoPannerNode;
  private dblLfoL: OscillatorNode;
  private dblLfoR: OscillatorNode;
  private dblLfoGainL: GainNode;
  private dblLfoGainR: GainNode;

  // Delay
  private dly: Slot;
  private delayNode: DelayNode;
  private delayFb: GainNode;
  private delayTone: BiquadFilterNode;

  // Reverb
  private rev: Slot;
  private convolver: ConvolverNode;
  private revPreDelay: DelayNode;
  private revSize = -1;
  private revDecay = -1;

  // Limiter
  private lim: Slot;
  private limiter: DynamicsCompressorNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // ----- build slots -----
    this.gate = makeSlot(ctx);
    this.eq = makeSlot(ctx);
    this.deEsser = makeSlot(ctx);
    this.comp = makeSlot(ctx);
    this.sat = makeSlot(ctx);
    this.dbl = makeSlot(ctx);
    this.dly = makeSlot(ctx);
    this.rev = makeSlot(ctx);
    this.lim = makeSlot(ctx);

    // ----- gate process -----
    this.gateGain = ctx.createGain();
    this.gateDetector = ctx.createAnalyser();
    this.gateDetector.fftSize = 1024;
    this.gateBuf = new Float32Array(this.gateDetector.fftSize);
    this.gate.input.connect(this.gateGain);
    this.gate.input.connect(this.gateDetector);
    this.gateGain.connect(this.gate.wet);

    // ----- eq process -----
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = "highpass";
    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.eq.input.connect(this.hpf);
    this.hpf.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.eq.wet);

    // ----- de-esser process (split band) -----
    this.deLow = ctx.createBiquadFilter();
    this.deLow.type = "lowpass";
    this.deHigh = ctx.createBiquadFilter();
    this.deHigh.type = "highpass";
    this.deComp = ctx.createDynamicsCompressor();
    this.deComp.knee.value = 2;
    this.deComp.attack.value = 0.001;
    this.deComp.release.value = 0.05;
    this.deEsser.input.connect(this.deLow);
    this.deLow.connect(this.deEsser.wet);
    this.deEsser.input.connect(this.deHigh);
    this.deHigh.connect(this.deComp);
    this.deComp.connect(this.deEsser.wet);

    // ----- compressor process -----
    this.compressor = ctx.createDynamicsCompressor();
    this.compMakeup = ctx.createGain();
    this.comp.input.connect(this.compressor);
    this.compressor.connect(this.compMakeup);
    this.compMakeup.connect(this.comp.wet);

    // ----- saturation process -----
    this.satPre = ctx.createGain();
    this.satShaper = ctx.createWaveShaper();
    this.satShaper.oversample = "4x";
    this.satShaper.curve = makeTanhCurve(3);
    this.satPost = ctx.createGain();
    this.sat.input.connect(this.satPre);
    this.satPre.connect(this.satShaper);
    this.satShaper.connect(this.satPost);
    this.satPost.connect(this.sat.wet);

    // ----- doubler / chorus process -----
    this.dblDelayL = ctx.createDelay(0.1);
    this.dblDelayR = ctx.createDelay(0.1);
    this.dblPanL = ctx.createStereoPanner();
    this.dblPanR = ctx.createStereoPanner();
    this.dblLfoL = ctx.createOscillator();
    this.dblLfoR = ctx.createOscillator();
    this.dblLfoGainL = ctx.createGain();
    this.dblLfoGainR = ctx.createGain();
    this.dblLfoL.frequency.value = 1.2;
    this.dblLfoR.frequency.value = 1.05;
    this.dblLfoL.connect(this.dblLfoGainL).connect(this.dblDelayL.delayTime);
    this.dblLfoR.connect(this.dblLfoGainR).connect(this.dblDelayR.delayTime);
    this.dbl.input.connect(this.dblDelayL).connect(this.dblPanL).connect(this.dbl.wet);
    this.dbl.input.connect(this.dblDelayR).connect(this.dblPanR).connect(this.dbl.wet);
    this.dblLfoL.start();
    this.dblLfoR.start();

    // ----- delay process -----
    this.delayNode = ctx.createDelay(2.5);
    this.delayFb = ctx.createGain();
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = "lowpass";
    this.dly.input.connect(this.delayNode);
    this.delayNode.connect(this.delayTone);
    this.delayTone.connect(this.delayFb);
    this.delayFb.connect(this.delayNode); // feedback loop
    this.delayTone.connect(this.dly.wet);

    // ----- reverb process -----
    this.convolver = ctx.createConvolver();
    this.revPreDelay = ctx.createDelay(0.5);
    this.rev.input.connect(this.revPreDelay);
    this.revPreDelay.connect(this.convolver);
    this.convolver.connect(this.rev.wet);

    // ----- limiter process -----
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.ratio.value = 20;
    this.limiter.knee.value = 0;
    this.limiter.attack.value = 0.002;
    this.lim.input.connect(this.limiter);
    this.limiter.connect(this.lim.wet);

    // ----- wire slots in series -----
    this.input.connect(this.gate.input);
    this.gate.output.connect(this.eq.input);
    this.eq.output.connect(this.deEsser.input);
    this.deEsser.output.connect(this.comp.input);
    this.comp.output.connect(this.sat.input);
    this.sat.output.connect(this.dbl.input);
    this.dbl.output.connect(this.dly.input);
    this.dly.output.connect(this.rev.input);
    this.rev.output.connect(this.lim.input);
    this.lim.output.connect(this.output);
  }

  /** Apply a full effects state (params + enable/bypass). */
  apply(s: EffectsState) {
    const now = this.ctx.currentTime;

    // Gate
    this.gateEnabled = s.gate.enabled;
    this.gateThreshLin = dbToGain(s.gate.threshold);
    this.gateAttack = Math.max(0.001, s.gate.attack);
    this.gateRelease = Math.max(0.01, s.gate.release);
    this.gateFloor = s.gate.floor;
    this.setInsert(this.gate, s.gate.enabled);

    // EQ
    this.hpf.frequency.value = s.eq.hpf;
    this.low.frequency.value = s.eq.lowFreq;
    this.low.gain.value = s.eq.lowGain;
    this.mid.frequency.value = s.eq.midFreq;
    this.mid.Q.value = s.eq.midQ;
    this.mid.gain.value = s.eq.midGain;
    this.high.frequency.value = s.eq.highFreq;
    this.high.gain.value = s.eq.highGain;
    this.setInsert(this.eq, s.eq.enabled);

    // De-esser
    this.deLow.frequency.value = s.deEsser.freq;
    this.deHigh.frequency.value = s.deEsser.freq;
    this.deComp.threshold.value = s.deEsser.threshold;
    this.deComp.ratio.value = s.deEsser.ratio;
    this.setInsert(this.deEsser, s.deEsser.enabled);

    // Compressor
    this.compressor.threshold.value = s.compressor.threshold;
    this.compressor.ratio.value = s.compressor.ratio;
    this.compressor.attack.value = s.compressor.attack;
    this.compressor.release.value = s.compressor.release;
    this.compressor.knee.value = s.compressor.knee;
    this.compMakeup.gain.value = dbToGain(s.compressor.makeup);
    this.setInsert(this.comp, s.compressor.enabled);

    // Saturation
    this.satShaper.curve = makeTanhCurve(s.saturation.drive);
    this.satPre.gain.value = 1 + s.saturation.drive * 0.15;
    this.satPost.gain.value = 1 / (1 + s.saturation.drive * 0.06);
    this.setBlend(this.sat, s.saturation.enabled, s.saturation.mix);

    // Doubler / chorus
    const baseL = 0.012;
    const baseR = 0.019;
    this.dblDelayL.delayTime.setTargetAtTime(baseL, now, 0.05);
    this.dblDelayR.delayTime.setTargetAtTime(baseR, now, 0.05);
    this.dblLfoL.frequency.value = s.doubler.rate;
    this.dblLfoR.frequency.value = s.doubler.rate * 0.85;
    this.dblLfoGainL.gain.value = s.doubler.depthMs / 1000;
    this.dblLfoGainR.gain.value = s.doubler.depthMs / 1000;
    this.dblPanL.pan.value = -s.doubler.spread;
    this.dblPanR.pan.value = s.doubler.spread;
    this.setBlend(this.dbl, s.doubler.enabled, s.doubler.mix);

    // Delay
    this.delayNode.delayTime.value = s.delay.time;
    this.delayFb.gain.value = Math.min(0.95, s.delay.feedback);
    this.delayTone.frequency.value = s.delay.tone;
    this.setBlend(this.dly, s.delay.enabled, s.delay.mix);

    // Reverb (regenerate IR only when size/decay change)
    if (s.reverb.size !== this.revSize || s.reverb.decay !== this.revDecay) {
      this.convolver.buffer = generateImpulse(this.ctx, s.reverb.size, s.reverb.decay);
      this.revSize = s.reverb.size;
      this.revDecay = s.reverb.decay;
    }
    this.revPreDelay.delayTime.value = s.reverb.preDelay;
    this.setBlend(this.rev, s.reverb.enabled, s.reverb.mix);

    // Limiter
    this.limiter.threshold.value = s.limiter.threshold;
    this.limiter.release.value = s.limiter.release;
    this.setInsert(this.lim, s.limiter.enabled);
  }

  private setInsert(slot: Slot, enabled: boolean) {
    slot.wet.gain.value = enabled ? 1 : 0;
    slot.dry.gain.value = enabled ? 0 : 1;
  }

  private setBlend(slot: Slot, enabled: boolean, mix: number) {
    slot.dry.gain.value = 1;
    slot.wet.gain.value = enabled ? Math.max(0, Math.min(1, mix)) : 0;
  }

  /** Called each animation frame to run the envelope-follower noise gate. */
  updateDynamics() {
    if (!this.gateEnabled) {
      if (this.gateCurrent !== 1) {
        this.gateCurrent = 1;
        this.gateGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
      }
      return;
    }
    this.gateDetector.getFloatTimeDomainData(this.gateBuf);
    let sum = 0;
    for (let i = 0; i < this.gateBuf.length; i++) sum += this.gateBuf[i] * this.gateBuf[i];
    const rms = Math.sqrt(sum / this.gateBuf.length);
    const open = rms >= this.gateThreshLin;
    const target = open ? 1 : this.gateFloor;
    if (target !== this.gateCurrent) {
      const tc = open ? this.gateAttack : this.gateRelease;
      this.gateGain.gain.setTargetAtTime(target, this.ctx.currentTime, tc);
      this.gateCurrent = target;
    }
  }

  /** Live gain-reduction readings (dB, <= 0) for the meters. */
  getReduction(): { comp: number; limiter: number } {
    return {
      comp: this.comp.wet.gain.value > 0 ? this.compressor.reduction : 0,
      limiter: this.lim.wet.gain.value > 0 ? this.limiter.reduction : 0,
    };
  }

  dispose() {
    try {
      this.dblLfoL.stop();
      this.dblLfoR.stop();
    } catch {
      /* already stopped */
    }
    // Disconnecting input/output detaches the whole internal graph from the
    // context; GC collects the rest once references drop.
    try {
      this.input.disconnect();
      this.output.disconnect();
    } catch {
      /* ignore */
    }
  }
}
