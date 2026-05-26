/**
 * Procedurally generate a stereo impulse response for the ConvolverNode reverb.
 * This is real convolution reverb - the IR is synthesised (decaying filtered
 * noise) rather than loaded from a file, so there are no external assets.
 */
export function generateImpulse(
  ctx: BaseAudioContext,
  size: number, // 0..1 -> ~0.2s .. ~4s
  decay: number // 0..1 -> shape of the decay tail
): AudioBuffer {
  const seconds = 0.2 + Math.max(0, Math.min(1, size)) * 3.8;
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * rate));
  const decayPow = 2 + (1 - Math.max(0, Math.min(1, decay))) * 6; // 2..8
  const impulse = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decayPow);
      // White noise, gently low-passed so the tail isn't harsh.
      const white = Math.random() * 2 - 1;
      lp = lp + 0.35 * (white - lp);
      data[i] = lp * env;
    }
  }
  return impulse;
}
