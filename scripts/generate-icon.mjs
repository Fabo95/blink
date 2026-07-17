// Generates a 1024×1024 source PNG for Blink's app icon using only Node built-ins.
// A glass "magic globe" on the architecture doc's dark-violet palette:
// sphere shading, a glassy fresnel rim, inner refraction glow, a specular
// hotspot, a violet bloom halo and a few sparkles. 2× supersampled for clean AA.
// Run `pnpm --filter @blink/desktop tauri icon src-tauri/app-icon.png` afterward.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;
const SS = 2; // supersampling factor

// --- palette (linear-ish sRGB bytes) ---
const BG_TOP = [24, 18, 44];
const BG_BOT = [6, 5, 14];
const GLOW = [139, 92, 246];
const BALL_EDGE = [34, 19, 72];
const BALL_MID = [122, 82, 236];
const BALL_LIT = [176, 158, 248];
const RIM = [214, 197, 255];
const INNER = [176, 150, 255];
const WHITE = [255, 255, 255];

// ball geometry (normalized 0..1)
const CX = 0.5;
const CY = 0.465;
const R = 0.325;

// light direction (from upper-left, toward viewer)
const L = norm3(-0.45, -0.62, 0.64);

const SPARKLES = [
  { u: 0.59, v: 0.5, size: 0.014, int: 0.8 },
  { u: 0.45, v: 0.6, size: 0.009, int: 0.45 },
];

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

function shade(u, v) {
  // background: vertical gradient + corner vignette
  let col = mix(BG_TOP, BG_BOT, v);
  const vig = 1 - 0.5 * Math.min(1, (Math.hypot(u - 0.5, v - 0.5) / 0.72) ** 2);
  col = scale(col, vig);

  const dx = u - CX;
  const dy = v - CY;
  const d = Math.hypot(dx, dy);

  // violet bloom halo around the ball
  const halo = Math.exp(-((Math.max(0, d - R * 0.55) / (R * 0.85)) ** 2));
  col = add(col, scale(GLOW, halo * 0.46));

  // faint reflection below the ball
  const rdy = v - (CY + R + 0.13);
  const refl = Math.exp(-((dx / (R * 0.7)) ** 2) - (rdy / (R * 0.28)) ** 2);
  col = add(col, scale(GLOW, refl * 0.12));

  const nx = dx / R;
  const ny = dy / R;
  const nz2 = 1 - nx * nx - ny * ny;
  if (nz2 > -0.06) {
    const nz = Math.sqrt(Math.max(0, nz2));
    const cov = clamp((R - d) / (0.7 / SIZE / SS) + 0.5, 0, 1); // AA edge coverage

    const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    let ball = mix(BALL_EDGE, BALL_MID, diff ** 0.85);
    ball = mix(ball, BALL_LIT, diff ** 2.4 * 0.85);

    // fresnel glass rim
    const fres = (1 - nz) ** 3.2;
    ball = add(ball, scale(RIM, fres * 0.95));

    // inner refraction glow (opposite the light — lower-right) — the "magic"
    const gx = nx - 0.32;
    const gy = ny - 0.44;
    ball = add(ball, scale(INNER, Math.exp(-(gx * gx + gy * gy) / 0.09) * 0.6));

    // broad soft highlight (upper area) — kept subtle to avoid a milky look
    const hx = nx + 0.22;
    const hy = ny + 0.5;
    ball = add(ball, scale(BALL_LIT, Math.exp(-(hx * hx + hy * hy) / 0.13) * 0.16));

    // tight specular hotspot
    const sx = nx + 0.42;
    const sy = ny + 0.46;
    ball = add(ball, scale(WHITE, Math.exp(-(sx * sx + sy * sy) / 0.01) * 0.95));

    // sparkles (only on the glass)
    let spark = 0;
    for (const s of SPARKLES) {
      const ux = u - s.u;
      const uy = v - s.v;
      const dd = ux * ux + uy * uy;
      const core = Math.exp(-dd / (s.size * s.size * 0.06));
      const fx =
        Math.exp(-(uy * uy) / (s.size * s.size * 0.02)) * Math.exp(-Math.abs(ux) / (s.size * 0.9));
      const fy =
        Math.exp(-(ux * ux) / (s.size * s.size * 0.02)) * Math.exp(-Math.abs(uy) / (s.size * 0.9));
      spark += (core + (fx + fy) * 0.6) * s.int;
    }
    ball = add(ball, scale(WHITE, Math.min(1.1, spark)));

    col = mix(col, ball, cov);
  }

  return [clamp(col[0], 0, 255), clamp(col[1], 0, 255), clamp(col[2], 0, 255)];
}

// --- render with supersampling ---
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / SIZE;
        const v = (y + (sy + 0.5) / SS) / SIZE;
        const c = shade(u, v);
        r += c[0];
        g += c[1];
        b += c[2];
      }
    }
    const n = SS * SS;
    raw[p++] = Math.round(r / n);
    raw[p++] = Math.round(g / n);
    raw[p++] = Math.round(b / n);
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

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/desktop/src-tauri/app-icon.png',
);
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
