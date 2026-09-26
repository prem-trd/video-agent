import zlib from "node:zlib";

// Tiny, dependency-free vector rasterizer for the end/opening screen button
// graphics (like / share / subscribe). The ffmpeg build has no SVG decoder
// and the system fonts have no thumbs-up/share glyphs, so the icons are
// drawn here from SVG path data (Material Icons, Apache-2.0) and written as
// PNGs that ffmpeg overlays like any other image.

type Point = [number, number];

/** Parses the SVG path subset Material icons use (M L H V C S Z, absolute and relative) into closed polygons. */
function pathToPolygons(d: string, curveSteps = 16): Point[][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polys: Point[][] = [];
  let poly: Point[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: Point | null = null;
  let cmd = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    for (let s = 1; s <= curveSteps; s++) {
      const t = s / curveSteps;
      const mt = 1 - t;
      poly.push([
        mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x,
        mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y,
      ]);
    }
    lastCtrl = [x2, y2];
    cx = x;
    cy = y;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        if (poly.length) polys.push(poly);
        cx = ox + num();
        cy = oy + num();
        startX = cx;
        startY = cy;
        poly = [[cx, cy]];
        cmd = rel ? "l" : "L"; // subsequent pairs are implicit lineto
        lastCtrl = null;
        break;
      }
      case "L":
        cx = ox + num();
        cy = oy + num();
        poly.push([cx, cy]);
        lastCtrl = null;
        break;
      case "H":
        cx = (rel ? cx : 0) + num();
        poly.push([cx, cy]);
        lastCtrl = null;
        break;
      case "V":
        cy = (rel ? cy : 0) + num();
        poly.push([cx, cy]);
        lastCtrl = null;
        break;
      case "C": {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num();
        cubic(x1, y1, x2, y2, x, y);
        break;
      }
      case "S": {
        const prev: Point = lastCtrl ?? [cx, cy];
        const x1 = 2 * cx - prev[0], y1 = 2 * cy - prev[1];
        const x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num();
        cubic(x1, y1, x2, y2, x, y);
        break;
      }
      case "Z":
        poly.push([startX, startY]);
        polys.push(poly);
        poly = [];
        cx = startX;
        cy = startY;
        lastCtrl = null;
        break;
      default:
        throw new Error(`Unsupported path command: ${cmd}`);
    }
  }
  if (poly.length) polys.push(poly);
  return polys;
}

/** Non-zero winding coverage with 4x4 supersampling -> alpha 0..255 per pixel. */
function rasterize(polys: Point[][], size: number, viewBox: number, transform: (p: Point) => Point): Uint8Array {
  const scale = size / viewBox;
  const edges: [number, number, number, number][] = [];
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const [ax, ay] = transform(poly[k]);
      const [bx, by] = transform(poly[(k + 1) % poly.length]);
      edges.push([ax * scale, ay * scale, bx * scale, by * scale]);
    }
  }
  const alpha = new Uint8Array(size * size);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let sy = 0; sy < SS; sy++) {
      const py = y + (sy + 0.5) / SS;
      // x-crossings of this sample row, with winding direction
      const xs: [number, number][] = [];
      for (const [ax, ay, bx, by] of edges) {
        if (ay <= py !== by <= py) xs.push([ax + ((py - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
      }
      xs.sort((a, b) => a[0] - b[0]);
      for (let x = 0; x < size; x++) {
        let covered = 0;
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          let winding = 0;
          for (const [ex, dir] of xs) {
            if (ex > px) break;
            winding += dir;
          }
          if (winding !== 0) covered++;
        }
        alpha[y * size + x] = Math.min(255, alpha[y * size + x] + Math.round((covered / SS) * (255 / SS)));
      }
    }
  }
  return alpha;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BRAND_RED: [number, number, number] = [0xe5, 0x3a, 0x1e];

// Material Icons paths on a 24x24 grid.
const THUMB_UP = "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z";
const REPLY = "M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z";

function circle(cx: number, cy: number, r: number, steps = 96): Point[] {
  return Array.from({ length: steps }, (_, k) => [cx + r * Math.cos((k / steps) * Math.PI * 2), cy + r * Math.sin((k / steps) * Math.PI * 2)] as Point);
}

/**
 * A round red button with a white icon (like = thumbs up, share = curved
 * arrow, as on the channel's existing videos), `size` px square PNG.
 */
export function renderRoundIconPng(kind: "like" | "share", size = 256): Buffer {
  const bg = rasterize([circle(12, 12, 11.6)], size, 24, (p) => p);
  // Icon scaled to ~55% of the circle, centred; share arrow mirrored to point right.
  const iconScale = 0.55;
  const offset = 12 - 12 * iconScale;
  const icon = rasterize(pathToPolygons(kind === "like" ? THUMB_UP : REPLY), size, 24, ([x, y]) => [
    (kind === "share" ? 24 - x : x) * iconScale + offset,
    y * iconScale + offset + (kind === "like" ? -0.3 : 0),
  ]);
  const rgba = new Uint8Array(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    const a = bg[p] / 255;
    const w = icon[p] / 255;
    rgba[p * 4] = Math.round(BRAND_RED[0] * (1 - w) + 255 * w);
    rgba[p * 4 + 1] = Math.round(BRAND_RED[1] * (1 - w) + 255 * w);
    rgba[p * 4 + 2] = Math.round(BRAND_RED[2] * (1 - w) + 255 * w);
    rgba[p * 4 + 3] = Math.round(255 * Math.max(a, w));
  }
  return encodePng(size, size, rgba);
}

/** A red rounded "pill" (no text - ffmpeg draws the SUBSCRIBE label on it) with a soft darker bottom edge. */
export function renderPillPng(width = 520, height = 128): Buffer {
  const r = height / 2;
  const steps = 48;
  const pts: Point[] = [];
  for (let k = 0; k <= steps; k++) pts.push([width - r + r * Math.cos(-Math.PI / 2 + (k / steps) * Math.PI), r + r * Math.sin(-Math.PI / 2 + (k / steps) * Math.PI)]);
  for (let k = 0; k <= steps; k++) pts.push([r + r * Math.cos(Math.PI / 2 + (k / steps) * Math.PI), r + r * Math.sin(Math.PI / 2 + (k / steps) * Math.PI)]);
  // rasterize() takes a square canvas; draw into width x width and crop the top `height` rows.
  const alpha = rasterize([pts], width, width, (p) => p);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const shade = y > height * 0.78 ? 0.82 : 1; // subtle 3D lip like the original button
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      rgba[p * 4] = Math.round(BRAND_RED[0] * shade);
      rgba[p * 4 + 1] = Math.round(BRAND_RED[1] * shade);
      rgba[p * 4 + 2] = Math.round(BRAND_RED[2] * shade);
      rgba[p * 4 + 3] = alpha[p];
    }
  }
  return encodePng(width, height, rgba);
}

/**
 * Makes the light (white / light-grey) background of a button image
 * transparent: flood-fills from the image border through near-white, low-
 * saturation pixels, so white *inside* the shape (the thumb, the arrow, the
 * SUBSCRIBE lettering) is kept. The 2px ring around the shape is feathered
 * and un-premultiplied so edges stay smooth on any background.
 * `rgba` is modified in place.
 */
export function removeEdgeBackground(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const isLight = (p: number) => {
    const r = rgba[p * 4], g = rgba[p * 4 + 1], b = rgba[p * 4 + 2];
    const min = Math.min(r, g, b);
    return rgba[p * 4 + 3] > 0 && min >= 110 && Math.max(r, g, b) - min <= 32;
  };
  const background = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (p: number) => {
    if (!background[p] && (rgba[p * 4 + 3] === 0 || isLight(p))) {
      background[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (y > 0) seed(p - width);
    if (y < height - 1) seed(p + width);
  }

  // Distance (in px, up to 2) from the background, for the feathered ring.
  const near = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (background[p]) continue;
    const x = p % width;
    const y = (p - x) / width;
    let d = 0;
    for (let dy = -2; dy <= 2 && !d; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || background[ny * width + nx]) {
          d = Math.max(Math.abs(dx), Math.abs(dy));
          break;
        }
      }
    }
    near[p] = d;
  }

  for (let p = 0; p < n; p++) {
    if (background[p]) {
      rgba[p * 4 + 3] = 0;
      continue;
    }
    if (near[p] === 1) {
      // Edge pixel = shape colour blended with white: estimate coverage from how far it is from white.
      const min = Math.min(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
      const a = Math.max(0.15, Math.min(1, (255 - min) / 200));
      for (let c = 0; c < 3; c++) rgba[p * 4 + c] = Math.max(0, Math.min(255, Math.round((rgba[p * 4 + c] - (1 - a) * 255) / a)));
      rgba[p * 4 + 3] = Math.round(a * rgba[p * 4 + 3]);
    }
  }
  return rgba;
}

