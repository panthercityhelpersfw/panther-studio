// Generates a 1024x1024 source PNG for Panther Studio (no external deps).
// Draws an "equalizer bars" mark on a dark rounded-square background.
// Run: node scripts/gen-icon.cjs  ->  src-tauri/app-icon.png
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const S = 1024;
const buf = Buffer.alloc(S * S * 4);

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  // simple alpha-over compositing onto existing pixel
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
}

function inRoundedRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

// Background rounded square with vertical gradient.
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedRect(x, y, 40, 40, S - 40, S - 40, 180)) continue;
    const t = y / S;
    const r = Math.round(16 + t * 18);
    const g = Math.round(19 + t * 14);
    const b = Math.round(26 + t * 40);
    setPx(x, y, r, g, b, 255);
  }
}

// Equalizer bars (vocal/DAW theme).
const bars = [
  { h: 0.34, c: [124, 92, 255] },
  { h: 0.62, c: [143, 114, 255] },
  { h: 0.92, c: [232, 179, 65] },
  { h: 0.55, c: [57, 211, 224] },
  { h: 0.78, c: [124, 92, 255] },
];
const barW = 96;
const gap = 44;
const totalW = bars.length * barW + (bars.length - 1) * gap;
const startX = Math.round((S - totalW) / 2);
const baseY = Math.round(S * 0.74);

bars.forEach((bar, idx) => {
  const x0 = startX + idx * (barW + gap);
  const x1 = x0 + barW;
  const barH = Math.round(S * 0.5 * bar.h);
  const y0 = baseY - barH;
  for (let y = y0; y <= baseY; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inRoundedRect(x, y, x0, y0, x1, baseY, barW / 2)) continue;
      const shade = 0.82 + 0.18 * ((baseY - y) / barH);
      setPx(
        x,
        y,
        Math.round(bar.c[0] * shade),
        Math.round(bar.c[1] * shade),
        Math.round(bar.c[2] * shade),
        255
      );
    }
  }
});

// Encode PNG (truecolor + alpha, no filtering) via zlib.
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter type none
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "src-tauri", "app-icon.png");
fs.writeFileSync(out, png);
console.log("Wrote", out, png.length, "bytes");
