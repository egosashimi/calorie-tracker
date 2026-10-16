// Renders the app icon (four tally strokes crossed by a fifth) to PNG without any image library.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [20, 20, 19];
const FG = [244, 243, 238];

// Strokes in a 100x100 design space.
const STROKES = [
  [32, 28, 32, 72], [44, 28, 44, 72], [56, 28, 56, 72], [68, 28, 68, 72],
  [23, 64, 77, 36],
];
const WIDTH = 5.2;

function segDist(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render(size, scale = 1) {
  const px = Buffer.alloc((size * 4 + 1) * size);
  const k = 100 / size;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // design coords, scaled about the center for the maskable variant
      const dxp = ((x + 0.5) * k - 50) / scale + 50;
      const dyp = ((y + 0.5) * k - 50) / scale + 50;
      let d = Infinity;
      for (const s of STROKES) d = Math.min(d, segDist(dxp, dyp, s));
      const edge = (WIDTH / 2 - d) / (k / scale) + 0.5;
      const a = Math.max(0, Math.min(1, edge));
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
      px[o + 3] = 255;
    }
  }
  return png(size, size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/icons/', import.meta.url);
writeFileSync(new URL('apple-touch-icon.png', dir), render(180));
writeFileSync(new URL('icon-192.png', dir), render(192));
writeFileSync(new URL('icon-512.png', dir), render(512));
writeFileSync(new URL('icon-maskable-512.png', dir), render(512, 0.8));
const lines = STROKES.map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join('');
writeFileSync(new URL('icon.svg', dir),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="rgb(${BG})"/>` +
  `<g stroke="rgb(${FG})" stroke-width="${WIDTH}" stroke-linecap="round">${lines}</g></svg>`);
console.log('icons written');
