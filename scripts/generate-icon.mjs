// Generates a 1024×1024 source PNG for Blink's app icon using only Node built-ins.
// A "crystal ball" mark on the architecture doc's dark-violet palette.
// Run `pnpm tauri icon` afterwards to expand it into the platform icon set.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SIZE = 1024;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

const bgTop = hexToRgb('#1e1830');
const bgBottom = hexToRgb('#0e0b16');
const ballEdge = hexToRgb('#8b5cf6');
const ballCore = hexToRgb('#c4b5fd');
const glow = hexToRgb('#a78bfa');

const cx = SIZE / 2;
const cy = SIZE * 0.46;
const R = SIZE * 0.32;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // PNG filter type: none
  for (let x = 0; x < SIZE; x++) {
    // Background vertical gradient + a soft glow behind the ball.
    let color = mix(bgTop, bgBottom, y / SIZE);
    const gd = Math.hypot(x - cx, y - cy) / (R * 2.2);
    if (gd < 1) color = mix(color, glow, (1 - gd) * 0.22);

    const d = Math.hypot(x - cx, y - cy);
    if (d <= R) {
      // Radial gradient, highlight offset toward the upper-left.
      const hd = Math.hypot(x - (cx - R * 0.32), y - (cy - R * 0.32)) / (R * 1.55);
      let ball = mix(ballCore, ballEdge, Math.min(1, hd));
      // Specular highlight dot.
      const sd = Math.hypot(x - (cx - R * 0.34), y - (cy - R * 0.36));
      if (sd < R * 0.12) ball = mix(ball, [255, 255, 255], (1 - sd / (R * 0.12)) * 0.85);
      // Anti-aliased rim.
      const edge = Math.min(1, (R - d) / 2);
      color = mix(color, ball, edge);
    }

    raw[p++] = color[0];
    raw[p++] = color[1];
    raw[p++] = color[2];
    raw[p++] = 255;
  }
}

// --- minimal PNG writer ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/desktop/src-tauri/app-icon.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
