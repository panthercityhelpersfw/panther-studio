/**
 * Real waveform peak extraction from decoded AudioBuffers. We keep a mono
 * mixdown per asset in memory and compute min/max peaks per pixel column on
 * demand, so waveforms stay crisp at any zoom level without re-decoding.
 */

const monoCache = new Map<string, Float32Array>();
const peaksCache = new Map<string, PeakColumn[]>();
const MAX_PEAK_CACHE = 180;

export function mixToMono(assetId: string, buffer: AudioBuffer): Float32Array {
  const cached = monoCache.get(assetId);
  if (cached) return cached;

  const len = buffer.length;
  const out = new Float32Array(len);
  const ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  if (ch > 1) {
    for (let i = 0; i < len; i++) out[i] /= ch;
  }
  monoCache.set(assetId, out);
  return out;
}

export function dropMono(assetId: string) {
  monoCache.delete(assetId);
  for (const key of [...peaksCache.keys()]) {
    if (key.startsWith(`${assetId}:`)) peaksCache.delete(key);
  }
}

export interface PeakColumn {
  min: number;
  max: number;
}

/**
 * Compute min/max peaks for a sample range, bucketed into `columns` columns.
 * `startSample`/`endSample` select the visible region of the asset.
 */
export function computePeaks(
  mono: Float32Array,
  startSample: number,
  endSample: number,
  columns: number
): PeakColumn[] {
  const out: PeakColumn[] = new Array(columns);
  const total = Math.max(1, endSample - startSample);
  const per = total / columns;

  for (let col = 0; col < columns; col++) {
    let s = Math.floor(startSample + col * per);
    let e = Math.floor(startSample + (col + 1) * per);
    s = Math.max(0, Math.min(mono.length - 1, s));
    e = Math.max(s + 1, Math.min(mono.length, e));
    let min = 1;
    let max = -1;
    for (let i = s; i < e; i++) {
      const v = mono[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min > max) {
      min = 0;
      max = 0;
    }
    out[col] = { min, max };
  }
  return out;
}

export function computePeaksCached(
  assetId: string,
  mono: Float32Array,
  startSample: number,
  endSample: number,
  columns: number
): PeakColumn[] {
  const bucketedColumns = Math.max(1, Math.round(columns / 2) * 2);
  const key = `${assetId}:${startSample}:${endSample}:${bucketedColumns}`;
  const cached = peaksCache.get(key);
  if (cached) return cached;
  const peaks = computePeaks(mono, startSample, endSample, bucketedColumns);
  peaksCache.set(key, peaks);
  if (peaksCache.size > MAX_PEAK_CACHE) {
    const first = peaksCache.keys().next().value;
    if (first) peaksCache.delete(first);
  }
  return peaks;
}

/** Draw a filled waveform into a 2D canvas context. */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: PeakColumn[],
  width: number,
  height: number,
  color: string,
  bgColor?: string
) {
  ctx.clearRect(0, 0, width, height);
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }
  const mid = height / 2;
  ctx.fillStyle = color;
  const cols = peaks.length;
  const colW = width / cols;
  for (let i = 0; i < cols; i++) {
    const { min, max } = peaks[i];
    const y1 = mid - max * mid * 0.92;
    const y2 = mid - min * mid * 0.92;
    const h = Math.max(1, y2 - y1);
    ctx.fillRect(i * colW, y1, Math.max(1, colW), h);
  }
  // Center line.
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, mid - 0.5, width, 1);
}
