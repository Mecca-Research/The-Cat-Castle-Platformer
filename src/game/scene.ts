import {
  blurCanvas,
  canvas,
  CHANDELIER_H,
  CHANDELIER_W,
  CRIMSON,
  ctx2d,
  CUSHION_HALF,
  DRAPE_H,
  DRAPE_W,
  drawSprite,
  EMERALD,
  makeSprite,
  outlined,
  paintBanner,
  paintChandelier,
  paintCushion,
  paintDrape,
  paintGlow,
  paintRopeTile,
  paintSushi,
  rng,
  ROPE_COIL,
  ROPE_TILE_W,
  type Flame,
  type Sprite,
} from "./art.ts";
import {
  FLOOR_Y,
  GOAL,
  LEFT_X,
  PERCH_W,
  PERCHES,
  RIGHT_X,
  SUMMIT,
  WORLD_H,
  WORLD_W,
  type Platform,
  type Side,
} from "./level.ts";

/**
 * The atrium, back to front:
 *   far hall (baked, blurred)  ->  arcaded galleries and the rose window
 *   (baked, softly blurred)  ->  drapes and chandeliers (sprites)  ->  light
 *   shafts  ->  the two cat trees and the marble floor  ->  Olive  ->  dust
 *   motes, blurred foreground columns, vignette.
 *
 * Background layers scroll slower than the world. Each is baked for the
 * current view so it covers exactly the climb from floor to crown.
 */

export type View = {
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  /** Device pixels per world unit. */
  k: number;
};

const TAU = Math.PI * 2;
const FAR_F = 0.2;
const MID_F = 0.46;
const NEAR_F = 0.78;
const FG_F = 1.4;

/** Where the camera settles when Olive stands with her feet at `y`. */
export function cameraYFor(feetY: number, viewH: number) {
  const max = Math.max(0, WORLD_H - viewH);
  return Math.max(0, Math.min(max, feetY - 64 - viewH * 0.58));
}

type LayerInfo = {
  W: number;
  H: number;
  viewH: number;
  f: number;
  /** Layer y that lines up behind world y when the camera is looking there. */
  y: (worldY: number) => number;
};

type Layer = { canvas: HTMLCanvasElement; f: number; H: number; res: number };

function layerInfo(f: number, viewH: number): LayerInfo {
  const H = viewH + Math.max(0, WORLD_H - viewH) * f;
  return {
    W: WORLD_W,
    H,
    viewH,
    f,
    y: (wy: number) => wy - cameraYFor(wy, viewH) * (1 - f),
  };
}

function bakeLayer(
  f: number,
  view: View,
  quality: number,
  blur: number,
  paint: (g: CanvasRenderingContext2D, L: LayerInfo) => void,
): Layer {
  const L = layerInfo(f, view.viewH);
  // Keep big layers within a sane pixel budget; blurred layers lose nothing.
  const budget = 7_000_000;
  let res = view.k * quality;
  res = Math.min(res, Math.sqrt(budget / (L.W * L.H)), 4096 / L.H, 4096 / L.W);
  const c = canvas(L.W * res, L.H * res);
  const g = ctx2d(c);
  g.scale(res, res);
  g.lineJoin = "round";
  g.lineCap = "round";
  paint(g, L);
  blurCanvas(c, blur * res);
  return { canvas: c, f, H: L.H, res };
}

/* ------------------------------------------------------------------------ */
/* Far hall                                                                  */
/* ------------------------------------------------------------------------ */

function archPath(
  g: CanvasRenderingContext2D | Path2D,
  cx: number,
  top: number,
  w: number,
  bottom: number,
) {
  const r = w / 2;
  g.moveTo(cx - r, bottom);
  g.lineTo(cx - r, top + r);
  g.arc(cx, top + r, r, Math.PI, 0);
  g.lineTo(cx + r, bottom);
  g.closePath();
}

function paintFar(g: CanvasRenderingContext2D, L: LayerInfo) {
  const { W, H } = L;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#8d8a66");
  bg.addColorStop(0.3, "#3d5247");
  bg.addColorStop(0.7, "#1e332f");
  bg.addColorStop(1, "#0f1d1c");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Tall windows far across the hall, full of afternoon sun.
  const rowGap = 330;
  for (let r = 0; ; r++) {
    const bottom = H - 40 - r * rowGap;
    if (bottom < -40) break;
    const lift = 1 - Math.max(0, bottom) / H;
    for (const cx of [90, 300, 520, 740, 950]) {
      const big = cx === 520;
      const w = big ? 130 : 96;
      const top = bottom - (big ? 270 : 230);
      const mid = (top + bottom) / 2;
      const pool = g.createRadialGradient(cx, mid, 10, cx, mid, 230);
      pool.addColorStop(0, `rgba(255, 214, 140, ${0.32 + 0.2 * lift})`);
      pool.addColorStop(1, "rgba(255, 214, 140, 0)");
      g.fillStyle = pool;
      g.fillRect(cx - 240, top - 140, 480, bottom - top + 280);
      const glass = g.createLinearGradient(cx, top, cx, bottom);
      glass.addColorStop(0, "rgba(255, 250, 228, 0.98)");
      glass.addColorStop(0.6, "rgba(255, 226, 160, 0.95)");
      glass.addColorStop(1, "rgba(236, 176, 96, 0.9)");
      g.fillStyle = glass;
      g.beginPath();
      archPath(g, cx, top, w, bottom);
      g.fill();
      g.strokeStyle = "rgba(40, 52, 40, 0.55)";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, top + 6);
      g.lineTo(cx, bottom);
      for (let k = 1; k < 4; k++) {
        const y = top + w / 2 + ((bottom - top - w / 2) * k) / 4;
        g.moveTo(cx - w / 2, y);
        g.lineTo(cx + w / 2, y);
      }
      g.stroke();
      // Greenery beyond the glass.
      g.fillStyle = "rgba(120, 150, 90, 0.35)";
      g.beginPath();
      g.ellipse(cx - w * 0.2, bottom - 30, w * 0.4, 40, 0, 0, TAU);
      g.ellipse(cx + w * 0.25, bottom - 50, w * 0.35, 50, 0, 0, TAU);
      g.fill();
    }
  }
  // Great piers between the windows.
  for (const x of [195, 410, 630, 845]) {
    const pier = g.createLinearGradient(x - 30, 0, x + 30, 0);
    pier.addColorStop(0, "rgba(14, 28, 26, 0.85)");
    pier.addColorStop(0.5, "rgba(48, 70, 60, 0.8)");
    pier.addColorStop(1, "rgba(14, 28, 26, 0.9)");
    g.fillStyle = pier;
    g.fillRect(x - 28, 0, 56, H);
  }
  // Haze: warm high, cool low.
  const haze = g.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, "rgba(255, 228, 170, 0.35)");
  haze.addColorStop(0.4, "rgba(200, 190, 150, 0.06)");
  haze.addColorStop(1, "rgba(10, 24, 24, 0.25)");
  g.fillStyle = haze;
  g.fillRect(0, 0, W, H);
}

/* ------------------------------------------------------------------------ */
/* Galleries and the rose window                                             */
/* ------------------------------------------------------------------------ */

const STONE = "#29443c";
const STONE_LIGHT = "#3f5e51";
const STONE_DARK = "#152823";
const GILT = "#d2a650";
const GILT_LIGHT = "#f5d995";

function paintStone(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const rand = rng(seed);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, STONE_LIGHT);
  grad.addColorStop(1, STONE);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // Ashlar courses with slight tint changes.
  const course = 30;
  for (let yy = y; yy < y + h; yy += course) {
    const row = Math.round((yy - y) / course);
    const off = row % 2 ? 0 : 45;
    for (let xx = x - off; xx < x + w; xx += 90) {
      const t = rand();
      g.fillStyle =
        t < 0.5 ? `rgba(0, 0, 0, ${t * 0.12})` : `rgba(255, 240, 210, ${(t - 0.5) * 0.06})`;
      g.fillRect(xx + 1, yy + 1, 88, course - 2);
    }
    g.fillStyle = "rgba(10, 20, 18, 0.28)";
    g.fillRect(x, yy, w, 1.4);
    for (let xx = x - off; xx < x + w; xx += 90) g.fillRect(xx, yy, 1.4, course);
  }
}

function paintBaluster(g: CanvasRenderingContext2D, x: number, top: number, bottom: number) {
  const h = bottom - top;
  const p = new Path2D();
  p.moveTo(x - 3, top);
  p.lineTo(x + 3, top);
  p.bezierCurveTo(x + 2, top + h * 0.25, x + 7, top + h * 0.45, x + 6, top + h * 0.7);
  p.bezierCurveTo(x + 5, top + h * 0.85, x + 3, top + h * 0.9, x + 4, bottom);
  p.lineTo(x - 4, bottom);
  p.bezierCurveTo(x - 3, top + h * 0.9, x - 5, top + h * 0.85, x - 6, top + h * 0.7);
  p.bezierCurveTo(x - 7, top + h * 0.45, x - 2, top + h * 0.25, x - 3, top);
  p.closePath();
  const gr = g.createLinearGradient(x - 7, 0, x + 7, 0);
  gr.addColorStop(0, STONE_DARK);
  gr.addColorStop(0.4, "#5d8273");
  gr.addColorStop(1, STONE_DARK);
  g.fillStyle = gr;
  g.fill(p);
}

function paintGalleries(g: CanvasRenderingContext2D, L: LayerInfo) {
  const { W, H } = L;
  const floorLine = L.y(FLOOR_Y) - 24;
  const crown = Math.max(420, L.y(SUMMIT.y - 150));
  const span = floorLine - crown;
  const n = Math.max(1, Math.round(span / 400));
  const SH = span / n;
  const arches = [195, 520, 845];
  const AW = 196;

  for (let s = 0; s < n; s++) {
    const bottom = floorLine - s * SH;
    const top = bottom - SH;
    paintStone(g, 0, top, W, SH, 40 + s);
    const warm = g.createLinearGradient(0, top, W * 0.6, bottom);
    warm.addColorStop(0, "rgba(255, 210, 140, 0.16)");
    warm.addColorStop(0.6, "rgba(255, 210, 140, 0)");
    g.fillStyle = warm;
    g.fillRect(0, top, W, SH);
    // Openings onto the far hall.
    g.save();
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000";
    g.beginPath();
    for (const cx of arches) archPath(g, cx, top + 64, AW, bottom - 8);
    g.fill();
    g.restore();
    // Inner reveal: shade inside the arch thickness.
    for (const cx of arches) {
      g.save();
      g.beginPath();
      archPath(g, cx, top + 64, AW, bottom - 8);
      g.clip();
      const rev = g.createLinearGradient(cx - AW / 2, 0, cx + AW / 2, 0);
      rev.addColorStop(0, "rgba(12, 26, 24, 0.75)");
      rev.addColorStop(0.08, "rgba(12, 26, 24, 0)");
      rev.addColorStop(0.92, "rgba(12, 26, 24, 0)");
      rev.addColorStop(1, "rgba(12, 26, 24, 0.75)");
      g.fillStyle = rev;
      g.fillRect(cx - AW / 2, top, AW, SH);
      g.restore();
      // Archivolt: dark moulding with a gilt bead.
      g.beginPath();
      archPath(g, cx, top + 64, AW + 14, bottom - 8);
      g.strokeStyle = STONE_DARK;
      g.lineWidth = 14;
      g.stroke();
      g.beginPath();
      archPath(g, cx, top + 64, AW + 2, bottom - 8);
      g.strokeStyle = GILT;
      g.lineWidth = 2.2;
      g.stroke();
      // Keystone.
      g.fillStyle = STONE_LIGHT;
      g.beginPath();
      g.moveTo(cx - 12, top + 52);
      g.lineTo(cx + 12, top + 52);
      g.lineTo(cx + 8, top + 76);
      g.lineTo(cx - 8, top + 76);
      g.closePath();
      g.fill();
      g.strokeStyle = GILT;
      g.lineWidth = 1.2;
      g.stroke();
    }
    // Pilasters with gilt capitals.
    for (const x of [28, 357, 683, 1012]) {
      const pg = g.createLinearGradient(x - 28, 0, x + 28, 0);
      pg.addColorStop(0, STONE_DARK);
      pg.addColorStop(0.35, "#4f7365");
      pg.addColorStop(1, STONE_DARK);
      g.fillStyle = pg;
      g.fillRect(x - 26, top + 22, 52, SH - 22);
      g.fillStyle = "rgba(255, 255, 255, 0.06)";
      for (const fx of [-12, 0, 12]) g.fillRect(x + fx - 2, top + 70, 4, SH - 110);
      const cap = g.createLinearGradient(0, top + 40, 0, top + 62);
      cap.addColorStop(0, GILT_LIGHT);
      cap.addColorStop(1, "#7a5a22");
      g.fillStyle = cap;
      g.beginPath();
      g.moveTo(x - 34, top + 40);
      g.lineTo(x + 34, top + 40);
      g.lineTo(x + 27, top + 62);
      g.lineTo(x - 27, top + 62);
      g.closePath();
      g.fill();
      g.fillStyle = "#7a5a22";
      g.fillRect(x - 30, bottom - 52, 60, 6);
    }
    // Cornice with dentils.
    const cg = g.createLinearGradient(0, top, 0, top + 26);
    cg.addColorStop(0, "#5d8274");
    cg.addColorStop(1, STONE_DARK);
    g.fillStyle = cg;
    g.fillRect(0, top, W, 26);
    g.fillStyle = GILT;
    g.fillRect(0, top, W, 2.5);
    g.fillStyle = "rgba(10, 20, 18, 0.5)";
    for (let x = 4; x < W; x += 14) g.fillRect(x, top + 16, 7, 7);
    // Gallery balustrade at the foot of the storey.
    const railTop = bottom - 48;
    for (let x = 6; x < W; x += 17) paintBaluster(g, x, railTop + 8, bottom - 8);
    const rail = g.createLinearGradient(0, railTop, 0, railTop + 9);
    rail.addColorStop(0, "#6a9282");
    rail.addColorStop(1, STONE_DARK);
    g.fillStyle = rail;
    g.fillRect(0, railTop, W, 9);
    g.fillStyle = GILT;
    g.fillRect(0, railTop, W, 1.6);
    g.fillStyle = STONE_DARK;
    g.fillRect(0, bottom - 9, W, 9);
    // A pennant hanging in the middle arch on alternate storeys.
    if (s % 2 === 1) {
      g.save();
      g.translate(520, top + 30);
      paintBanner(g, 64, 190, s % 4 === 1 ? "#7d1830" : "#1d5a44");
      g.restore();
    }
  }
  // Below the galleries: the hall floor fading into shadow.
  const fl = g.createLinearGradient(0, floorLine, 0, H);
  fl.addColorStop(0, "#273f39");
  fl.addColorStop(1, "#0e1b19");
  g.fillStyle = fl;
  g.fillRect(0, floorLine, W, H - floorLine);

  paintCrown(g, W, crown);

  // Sunbeams from the high windows on the left, baked into the air.
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; ; i++) {
    const top = floorLine - 520 - i * 300;
    if (top < -600) break;
    const x0 = -80 + (i % 2) * 150;
    const lift = 1 - Math.max(0, top) / H;
    const a = 0.07 + 0.11 * lift;
    const len = 1400;
    const grad = g.createLinearGradient(x0, top, x0 + len * 0.36, top + len * 0.6);
    grad.addColorStop(0, `rgba(255, 216, 150, ${a})`);
    grad.addColorStop(0.55, `rgba(255, 216, 150, ${a * 0.45})`);
    grad.addColorStop(1, "rgba(255, 216, 150, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x0, top);
    g.lineTo(x0 + 100, top - 24);
    g.lineTo(x0 + 100 + len * 0.62 + 200, top - 24 + len);
    g.lineTo(x0 + len * 0.62 - 40, top + len);
    g.closePath();
    g.fill();
  }
  g.restore();

  // Atmosphere: haze the stone back toward the hall's light.
  g.save();
  g.globalCompositeOperation = "source-atop";
  const haze = g.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, "rgba(255, 220, 160, 0.26)");
  haze.addColorStop(0.35, "rgba(150, 170, 140, 0.06)");
  haze.addColorStop(1, "rgba(8, 18, 18, 0.3)");
  g.fillStyle = haze;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** The crown of the atrium: a coffered half-dome round a rose window. */
function paintCrown(g: CanvasRenderingContext2D, W: number, base: number) {
  const cx = W / 2;
  paintStone(g, 0, 0, W, base, 7);
  const R = Math.min(520, base + 60);
  // Coffered half-dome.
  g.save();
  g.beginPath();
  g.moveTo(cx - R, base);
  g.arc(cx, base, R, Math.PI, 0);
  g.closePath();
  g.clip();
  const dome = g.createRadialGradient(cx, base - 240, 40, cx, base, R);
  dome.addColorStop(0, "#f1d6a0");
  dome.addColorStop(0.45, "#9d9a78");
  dome.addColorStop(1, "#38574d");
  g.fillStyle = dome;
  g.fillRect(cx - R, base - R, R * 2, R);
  g.strokeStyle = "rgba(60, 50, 30, 0.35)";
  for (let ring = 1; ring < 5; ring++) {
    const r = R * (ring / 5);
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, base, r, Math.PI, 0);
    g.stroke();
  }
  for (let i = 1; i < 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.2, base + Math.sin(a) * R * 0.2);
    g.lineTo(cx + Math.cos(a) * R, base + Math.sin(a) * R);
    g.stroke();
  }
  g.restore();
  g.beginPath();
  g.arc(cx, base, R, Math.PI, 0);
  g.strokeStyle = STONE_DARK;
  g.lineWidth = 18;
  g.stroke();
  g.strokeStyle = GILT;
  g.lineWidth = 3;
  g.stroke();

  // Rose window.
  const rr = Math.min(150, R * 0.36);
  const ry = base - R * 0.52;
  const halo = g.createRadialGradient(cx, ry, rr * 0.5, cx, ry, rr * 2.4);
  halo.addColorStop(0, "rgba(255, 236, 190, 0.85)");
  halo.addColorStop(1, "rgba(255, 236, 190, 0)");
  g.fillStyle = halo;
  g.fillRect(cx - rr * 2.6, ry - rr * 2.6, rr * 5.2, rr * 5.2);
  const glass = ["#ffcf6b", "#d8445e", "#3fb3a3", "#4f74d9", "#ffcf6b", "#e0703c"];
  g.save();
  g.translate(cx, ry);
  g.fillStyle = "#3b2a14";
  g.beginPath();
  g.arc(0, 0, rr + 10, 0, TAU);
  g.fill();
  const petals = 12;
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * TAU;
    const a1 = ((i + 1) / petals) * TAU;
    for (let ring = 0; ring < 3; ring++) {
      const r0 = rr * [0.3, 0.55, 0.8][ring]!;
      const r1 = rr * [0.53, 0.78, 1][ring]!;
      g.fillStyle = glass[(i + ring * 2) % glass.length]!;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.arc(0, 0, r1 - 1.5, a0 + 0.03, a1 - 0.03);
      g.arc(0, 0, r0 + 1.5, a1 - 0.03, a0 + 0.03, true);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;
  // Light falling through the glass.
  const shine = g.createRadialGradient(-rr * 0.3, -rr * 0.3, 2, 0, 0, rr);
  shine.addColorStop(0, "rgba(255, 255, 240, 0.65)");
  shine.addColorStop(1, "rgba(255, 255, 240, 0.05)");
  g.fillStyle = shine;
  g.beginPath();
  g.arc(0, 0, rr, 0, TAU);
  g.fill();
  // Tracery.
  g.strokeStyle = "#2a1d0c";
  g.lineWidth = 3;
  for (const r of [0.3, 0.55, 0.8, 1]) {
    g.beginPath();
    g.arc(0, 0, rr * r, 0, TAU);
    g.stroke();
  }
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(a) * rr * 0.3, Math.sin(a) * rr * 0.3);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    g.stroke();
  }
  // A gilt paw at the heart of the rose.
  g.fillStyle = GILT_LIGHT;
  g.beginPath();
  g.arc(0, 0, rr * 0.28, 0, TAU);
  g.fill();
  g.fillStyle = "#8a5e1e";
  g.beginPath();
  g.ellipse(0, rr * 0.06, rr * 0.1, rr * 0.08, 0, 0, TAU);
  g.fill();
  for (const [dx, dy] of [
    [-0.12, -0.04],
    [-0.045, -0.12],
    [0.045, -0.12],
    [0.12, -0.04],
  ] as const) {
    g.beginPath();
    g.ellipse(dx * rr, dy * rr, rr * 0.035, rr * 0.045, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = GILT;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, rr + 6, 0, TAU);
  g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------------ */
/* Floor                                                                     */
/* ------------------------------------------------------------------------ */

const FLOOR_DEPTH = 300;

function paintFloor(g: CanvasRenderingContext2D) {
  const W = WORLD_W;
  const vpx = W / 2;
  const vpy = -820;
  const base = g.createLinearGradient(0, 0, 0, FLOOR_DEPTH);
  base.addColorStop(0, "#d8ccb2");
  base.addColorStop(1, "#7d6e58");
  g.fillStyle = base;
  g.fillRect(0, 0, W, FLOOR_DEPTH);
  // Perspective chequer of cream and verde marble.
  const rows: number[] = [0];
  for (let n = 1; rows[rows.length - 1]! < FLOOR_DEPTH; n++) rows.push(10 * (1.42 ** n - 1));
  const colAt = (x0: number, y: number) => vpx + (x0 - vpx) * ((y - vpy) / (0 - vpy));
  const tile = 58;
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = rows[r]!;
    const y1 = rows[r + 1]!;
    for (let i = -22; i < 22; i++) {
      const xa = vpx + i * tile;
      const xb = xa + tile;
      g.fillStyle = (i + r) % 2 === 0 ? "#e2d6bb" : "#56766a";
      g.beginPath();
      g.moveTo(colAt(xa, y0), y0);
      g.lineTo(colAt(xb, y0), y0);
      g.lineTo(colAt(xb, y1), y1);
      g.lineTo(colAt(xa, y1), y1);
      g.closePath();
      g.fill();
    }
  }
  // Veins.
  const rand = rng(5);
  for (let i = 0; i < 60; i++) {
    const x = rand() * W;
    const y = rand() * FLOOR_DEPTH;
    g.strokeStyle = rand() < 0.5 ? "rgba(255, 255, 255, 0.22)" : "rgba(60, 50, 40, 0.16)";
    g.lineWidth = 0.6 + rand();
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(
      x + 30,
      y + rand() * 10,
      x + 60,
      y - rand() * 10,
      x + 90 + rand() * 40,
      y + rand() * 8,
    );
    g.stroke();
  }
  // The long rug between the trees.
  const rx0 = 404;
  const rx1 = 636;
  const ry0 = 26;
  const ry1 = FLOOR_DEPTH + 20;
  const rug = new Path2D();
  rug.moveTo(colAt(rx0, ry0), ry0);
  rug.lineTo(colAt(rx1, ry0), ry0);
  rug.lineTo(colAt(rx1, ry1), ry1);
  rug.lineTo(colAt(rx0, ry1), ry1);
  rug.closePath();
  g.fillStyle = "#6a1426";
  g.fill(rug);
  g.save();
  g.clip(rug);
  const rg = g.createLinearGradient(0, ry0, 0, ry1);
  rg.addColorStop(0, "rgba(255, 200, 160, 0.18)");
  rg.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  g.fillStyle = rg;
  g.fillRect(0, 0, W, FLOOR_DEPTH + 40);
  g.strokeStyle = "#d9b25e";
  g.lineWidth = 3;
  const inset = (x0: number, x1: number, y0: number) => {
    g.beginPath();
    g.moveTo(colAt(x0, y0), y0);
    g.lineTo(colAt(x1, y0), y0);
    g.lineTo(colAt(x1, ry1), ry1);
    g.moveTo(colAt(x0, ry1), ry1);
    g.lineTo(colAt(x0, y0), y0);
    g.stroke();
  };
  inset(rx0 + 16, rx1 - 16, ry0 + 6);
  g.lineWidth = 1.2;
  inset(rx0 + 26, rx1 - 26, ry0 + 11);
  g.restore();
  // Polish: windows reflected as soft bright streaks.
  for (const x of [200, 520, 840]) {
    const s = g.createLinearGradient(0, 0, 0, FLOOR_DEPTH);
    s.addColorStop(0, "rgba(255, 240, 200, 0.35)");
    s.addColorStop(1, "rgba(255, 240, 200, 0)");
    g.fillStyle = s;
    g.beginPath();
    g.moveTo(x - 30, 0);
    g.lineTo(x + 30, 0);
    g.lineTo(colAt(x + 60, FLOOR_DEPTH), FLOOR_DEPTH);
    g.lineTo(colAt(x - 60, FLOOR_DEPTH), FLOOR_DEPTH);
    g.closePath();
    g.fill();
  }
  const fade = g.createLinearGradient(0, 0, 0, FLOOR_DEPTH);
  fade.addColorStop(0, "rgba(20, 16, 12, 0)");
  fade.addColorStop(1, "rgba(20, 16, 12, 0.5)");
  g.fillStyle = fade;
  g.fillRect(0, 0, W, FLOOR_DEPTH);
  // Skirting where the floor meets the wall.
  g.fillStyle = "#2a1a10";
  g.fillRect(0, -6, W, 8);
  g.fillStyle = GILT;
  g.fillRect(0, -6, W, 1.6);
  const occl = g.createLinearGradient(0, 0, 0, 26);
  occl.addColorStop(0, "rgba(10, 6, 4, 0.45)");
  occl.addColorStop(1, "rgba(10, 6, 4, 0)");
  g.fillStyle = occl;
  g.fillRect(0, 2, W, 26);
}

/* ------------------------------------------------------------------------ */
/* Scene                                                                     */
/* ------------------------------------------------------------------------ */

type Mote = { u: number; v: number; d: number; r: number; tw: number; sp: number; drift: number };
type Chandelier = { worldY: number; x: number };

const CHANDELIERS: Chandelier[] = [
  { worldY: 1820, x: 520 },
  { worldY: 1240, x: 520 },
  { worldY: 700, x: 520 },
];

export class Scene {
  private far: Layer | null = null;
  private mid: Layer | null = null;
  private key = "";
  private pending = "";
  private pendingSince = 0;
  private spriteK = 0;
  private cushion: Record<Side, Sprite> | null = null;
  private rope: Record<Side, CanvasPattern | null> = { left: null, right: null };
  private ropeRes = 1;
  private drape: Sprite | null = null;
  private chand: Sprite | null = null;
  private flames: Flame[] = [];
  private floor: Sprite | null = null;
  private sushi: Sprite | null = null;
  private glow: Sprite | null = null;
  private mote: Sprite | null = null;
  private fgColumn: Sprite | null = null;
  private motes: Mote[] = [];
  private dips = new Map<Platform, { y: number; v: number }>();

  constructor() {
    const rand = rng(77);
    for (let i = 0; i < 70; i++) {
      this.motes.push({
        u: rand(),
        v: rand(),
        d: 0.55 + rand() * 0.95,
        r: 0.6 + rand() * 1.6,
        tw: rand() * TAU,
        sp: 0.4 + rand() * 1.2,
        drift: (rand() - 0.5) * 6,
      });
    }
  }

  /** Re-bake anything whose resolution or shape depends on the view. */
  prepare(view: View) {
    // While a window is being resized, keep drawing the old bake (stretched)
    // and only re-bake once the size has held still for a moment.
    const now = performance.now();
    const key = `${Math.round(view.viewW)}x${Math.round(view.viewH)}@${Math.round(view.k * 8) / 8}`;
    if (key !== this.pending) {
      this.pending = key;
      this.pendingSince = now;
    }
    const settled = !this.far || now - this.pendingSince > 180;
    if (key !== this.key && settled) {
      this.key = key;
      this.far = bakeLayer(FAR_F, view, 0.45, 7, paintFar);
      this.mid = bakeLayer(MID_F, view, 0.75, 1.6, paintGalleries);
    }
    const resized = Math.abs(view.k - this.spriteK) > this.spriteK * 0.12;
    if ((resized && settled) || !this.cushion) {
      this.spriteK = view.k;
      const res = Math.min(4, view.k * 1.1);
      this.cushion = {
        left: makeSprite(CUSHION_HALF * 2 + 16, 64, CUSHION_HALF + 8, 22, res, (g) =>
          paintCushion(g, EMERALD, 3),
        ),
        right: makeSprite(CUSHION_HALF * 2 + 16, 64, CUSHION_HALF + 8, 22, res, (g) =>
          paintCushion(g, CRIMSON, 9),
        ),
      };
      this.ropeRes = res;
      for (const side of ["left", "right"] as const) {
        const tile = makeSprite(ROPE_TILE_W, ROPE_COIL * 4, 0, 0, res, (g) =>
          paintRopeTile(g, side === "left"),
        );
        this.rope[side] = ctx2d(tile.canvas).createPattern(tile.canvas, "repeat");
      }
      // The near wall sits just behind the trees: a touch soft, a touch dim.
      const nres = Math.min(3, view.k * 0.9);
      this.drape = makeSprite(DRAPE_W + 20, DRAPE_H + 4, 10, 0, nres, (g) => paintDrape(g, 4));
      blurCanvas(this.drape.canvas, 0.8 * nres);
      let flames: Flame[] = [];
      this.chand = makeSprite(
        CHANDELIER_W + 8,
        CHANDELIER_H + 8,
        CHANDELIER_W / 2 + 4,
        0,
        nres,
        (g) => {
          flames = paintChandelier(g);
          g.globalCompositeOperation = "source-atop";
          g.fillStyle = "rgba(30, 50, 44, 0.12)";
          g.fillRect(-CHANDELIER_W, 0, CHANDELIER_W * 2, CHANDELIER_H + 8);
        },
      );
      blurCanvas(this.chand.canvas, 0.55 * nres);
      this.flames = flames;
      this.floor = makeSprite(WORLD_W, FLOOR_DEPTH + 10, 0, 8, Math.min(3, view.k), paintFloor);
      const sushi = makeSprite(100, 64, 50, 56, res * 1.2, paintSushi);
      this.sushi = outlined(sushi, "#2a1a14", 1.4);
      this.glow = makeSprite(128, 128, 64, 64, 1, (g) =>
        paintGlow(g, 64, "rgba(255, 214, 140, 1)"),
      );
      this.mote = makeSprite(32, 32, 16, 16, 1, (g) => paintGlow(g, 16, "rgba(255, 236, 190, 1)"));
      this.fgColumn = this.bakeColumn(view.k);
    }
  }

  private bakeColumn(k: number): Sprite {
    // A column shaft close to the camera: dark, soft, and out of focus.
    const res = Math.max(0.25, Math.min(1, k * 0.35));
    const s = makeSprite(150, 900, 75, 0, res, (g) => {
      const gr = g.createLinearGradient(-60, 0, 60, 0);
      gr.addColorStop(0, "#050a09");
      gr.addColorStop(0.55, "#16241f");
      gr.addColorStop(0.8, "#2c3c33");
      gr.addColorStop(1, "#0b1210");
      g.fillStyle = gr;
      g.fillRect(-58, 0, 116, 900);
      g.fillStyle = "rgba(0, 0, 0, 0.5)";
      for (const x of [-30, -6, 18]) g.fillRect(x, 0, 6, 900);
      g.fillStyle = "#2b2414";
      g.fillRect(-66, 420, 132, 30);
      g.fillStyle = "rgba(230, 190, 110, 0.35)";
      g.fillRect(-66, 420, 132, 3);
    });
    blurCanvas(s.canvas, 9 * res);
    return s;
  }

  /** Spring a cushion down when Olive lands on it. */
  press(p: Platform, impact: number) {
    if (p.kind !== "perch") return;
    const d = this.dips.get(p) ?? { y: 0, v: 0 };
    d.v += Math.min(60, impact * 6);
    this.dips.set(p, d);
  }

  dipOf(p: Platform | null) {
    return p ? (this.dips.get(p)?.y ?? 0) : 0;
  }

  update(dt: number) {
    for (const [p, d] of this.dips) {
      d.v += (-320 * d.y - 18 * d.v) * dt;
      d.y += d.v * dt;
      if (Math.abs(d.y) < 0.01 && Math.abs(d.v) < 0.05) this.dips.delete(p);
    }
  }

  private layerAt(g: CanvasRenderingContext2D, layer: Layer | null, view: View) {
    if (!layer) return;
    const { viewW, viewH } = view;
    const range = Math.max(0, WORLD_H - viewH);
    const prog = range > 0 ? view.camY / range : 0;
    const sy = Math.max(0, Math.min(layer.H - viewH, prog * (layer.H - viewH)));
    const sx = view.camX * layer.f + ((WORLD_W - viewW) * (1 - layer.f)) / 2;
    const r = layer.res;
    const sh = Math.min(viewH, layer.H);
    g.drawImage(layer.canvas, sx * r, sy * r, viewW * r, sh * r, 0, 0, viewW, viewH);
  }

  /** Parallax offset for sprite layers in view space. */
  private par(view: View, f: number) {
    return {
      x: -(view.camX * f + ((WORLD_W - view.viewW) * (1 - f)) / 2),
      y: (wy: number) => {
        const L = wy - cameraYFor(wy, view.viewH) * (1 - f);
        return L - view.camY * f;
      },
    };
  }

  /** Everything behind the trees, drawn in view space (identity camera). */
  drawBackdrop(g: CanvasRenderingContext2D, view: View, t: number) {
    g.fillStyle = "#132726";
    g.fillRect(0, 0, view.viewW, view.viewH);
    this.layerAt(g, this.far, view);
    this.layerAt(g, this.mid, view);

    // Chandeliers and drapes on the near wall.
    const near = this.par(view, NEAR_F);
    if (this.chand) {
      for (const c of CHANDELIERS) {
        const x = c.x + near.x;
        const y = near.y(c.worldY - 330);
        if (y > view.viewH + 40 || y + CHANDELIER_H < -40) continue;
        const chain = g.createLinearGradient(0, y - 240, 0, y);
        chain.addColorStop(0, "rgba(59, 44, 20, 0)");
        chain.addColorStop(1, "rgba(59, 44, 20, 0.9)");
        g.strokeStyle = chain;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x, y - 240);
        g.lineTo(x, y + 2);
        g.stroke();
        // A slow pendulum sway from the chain.
        const sway = Math.sin(t * 0.8 + c.worldY) * 0.012;
        g.save();
        g.translate(x, y - 240);
        g.rotate(sway);
        g.translate(-x, -(y - 240));
        drawSprite(g, this.chand, x, y);
        this.drawFlames(g, x, y, t, 1);
        g.restore();
      }
    }
    if (this.drape) {
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        const wy = FLOOR_Y - 40 - i * 760;
        const y = near.y(wy) - DRAPE_H;
        if (y > view.viewH || y + DRAPE_H < 0) continue;
        // Drapes breathe in the draught: a slow skew from the rail.
        for (const [x, dir] of [
          [near.x - 18, 1],
          [WORLD_W + near.x + 18, -1],
        ] as const) {
          const skew = Math.sin(t * 0.55 + i * 1.7 + dir) * 0.018;
          g.save();
          g.transform(1, 0, skew, 1, -skew * y, 0);
          drawSprite(g, this.drape, x, y, dir, 1);
          g.restore();
        }
      }
    }
  }

  private drawFlames(g: CanvasRenderingContext2D, x: number, y: number, t: number, alpha: number) {
    if (!this.glow) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    const flick = 0.85 + Math.sin(t * 13 + x) * 0.08 + Math.sin(t * 7.3) * 0.07;
    g.globalAlpha = 0.33 * alpha * flick;
    drawSprite(g, this.glow, x, y + 80, 2.4, 2);
    for (const f of this.flames) {
      g.globalAlpha = 0.5 * alpha * flick;
      drawSprite(g, this.glow, x + f.x, y + f.y, 0.16, 0.22);
      g.globalAlpha = 0.9 * alpha;
      g.fillStyle = "#fff6d8";
      g.beginPath();
      g.ellipse(x + f.x, y + f.y + 1, 1.5, 3.4 * flick, 0, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  /** Sunlight falling in from the high windows on the left. */
  private drawShafts(
    g: CanvasRenderingContext2D,
    view: View,
    t: number,
    strength: number,
    every = 1,
  ) {
    const p = this.par(view, 0.86);
    g.save();
    g.globalCompositeOperation = "lighter";
    const sources = [2080, 1760, 1440, 1120, 800, 480];
    sources.forEach((wy, i) => {
      if (i % every !== 0) return;
      const top = p.y(wy - 420);
      const x0 = -60 + (i % 2) * 140 + p.x;
      const len = 1300;
      const dx = 0.62;
      if (top > view.viewH + 100 || top + len < -100) return;
      const high = 1 - wy / WORLD_H;
      const a = strength * (0.05 + 0.08 * high) * (0.75 + 0.25 * Math.sin(t * 0.35 + i * 1.7));
      const grad = g.createLinearGradient(x0, top, x0 + len * dx * 0.6, top + len * 0.6);
      grad.addColorStop(0, `rgba(255, 214, 150, ${a})`);
      grad.addColorStop(0.5, `rgba(255, 214, 150, ${a * 0.55})`);
      grad.addColorStop(1, "rgba(255, 214, 150, 0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0, top);
      g.lineTo(x0 + 90, top - 20);
      g.lineTo(x0 + 90 + len * dx + 180, top - 20 + len);
      g.lineTo(x0 + len * dx - 40, top + len);
      g.closePath();
      g.fill();
    });
    g.restore();
  }

  /** Trees and floor, in world space. */
  drawWorld(g: CanvasRenderingContext2D, view: View, t: number) {
    const top = view.camY - 40;
    const bottom = view.camY + view.viewH + 40;
    this.drawPosts(g, "left", top, bottom);
    this.drawPosts(g, "right", top, bottom);
    if (this.floor && FLOOR_Y - 10 < bottom) {
      drawSprite(g, this.floor, 0, FLOOR_Y);
      const below = FLOOR_Y + FLOOR_DEPTH;
      if (bottom > below) {
        g.fillStyle = "#6f604c";
        g.fillRect(0, below, WORLD_W, bottom - below);
      }
      this.drawBase(g, LEFT_X, EMERALD.base, EMERALD.dark);
      this.drawBase(g, RIGHT_X, CRIMSON.base, CRIMSON.dark);
    }
    void t;
  }

  /** Cushions go on after the posts so the cat stands in front of the posts. */
  drawCushions(g: CanvasRenderingContext2D, view: View) {
    if (!this.cushion) return;
    for (const p of PERCHES) {
      if (p.y < view.camY - 60 || p.y > view.camY + view.viewH + 60) continue;
      const dip = this.dipOf(p);
      const sprite = this.cushion[p.side];
      const squash = 1 - Math.max(-0.04, Math.min(0.12, dip * 0.02));
      drawSprite(g, sprite, p.x + p.w / 2, p.y + 22 - 22 * squash + dip * 0.3, 1, squash);
    }
  }

  private drawPosts(g: CanvasRenderingContext2D, side: Side, top: number, bottom: number) {
    const perches = PERCHES.filter((p) => p.side === side);
    const highest = Math.min(...perches.map((p) => p.y)) - 26;
    const x0 = side === "left" ? LEFT_X : RIGHT_X;
    const y0 = Math.max(highest, top);
    const y1 = Math.min(FLOOR_Y, bottom);
    if (y1 <= y0) return;
    const pattern = this.rope[side];
    for (const [t, w] of [
      [0.2, 22],
      [0.5, 30],
      [0.8, 22],
    ] as const) {
      const x = x0 + PERCH_W * t - w / 2;
      // Shadow the wall behind the post.
      g.fillStyle = "rgba(6, 12, 10, 0.25)";
      g.fillRect(x + 6, y0, w, y1 - y0);
      if (pattern) {
        pattern.setTransform(
          new DOMMatrix().translate(x, 0).scale(1 / this.ropeRes, 1 / this.ropeRes),
        );
        g.fillStyle = pattern;
      } else {
        g.fillStyle = "#c9a165";
      }
      g.fillRect(x, y0, w, y1 - y0);
      const shade = g.createLinearGradient(x, 0, x + w, 0);
      shade.addColorStop(0, "rgba(30, 16, 6, 0.55)");
      shade.addColorStop(0.3, "rgba(255, 240, 210, 0.18)");
      shade.addColorStop(0.45, "rgba(255, 240, 210, 0)");
      shade.addColorStop(1, "rgba(20, 10, 4, 0.6)");
      g.fillStyle = shade;
      g.fillRect(x, y0, w, y1 - y0);
      // Gilt collars under each shelf.
      for (const p of perches) {
        if (p.y + 31 < y0 || p.y + 31 > y1) continue;
        const cg = g.createLinearGradient(x, 0, x + w, 0);
        cg.addColorStop(0, "#6e4c18");
        cg.addColorStop(0.35, "#fbe2a0");
        cg.addColorStop(1, "#6e4c18");
        g.fillStyle = cg;
        g.fillRect(x - 2, p.y + 30, w + 4, 6);
      }
    }
  }

  private drawBase(g: CanvasRenderingContext2D, x0: number, color: string, dark: string) {
    const x = x0 + 10;
    const w = PERCH_W - 20;
    const y = FLOOR_Y - 22;
    g.fillStyle = "rgba(8, 4, 2, 0.35)";
    g.beginPath();
    g.ellipse(x + w / 2, FLOOR_Y + 6, w * 0.56, 10, 0, 0, TAU);
    g.fill();
    const gr = g.createLinearGradient(0, y, 0, FLOOR_Y + 6);
    gr.addColorStop(0, color);
    gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(x, y, w, 28, 8);
    g.fill();
    g.fillStyle = GILT;
    g.fillRect(x + 4, y + 2, w - 8, 2);
    g.fillStyle = "rgba(255, 255, 255, 0.12)";
    g.fillRect(x + 6, y + 5, w - 12, 5);
  }

  /** The salmon on the crown perch, bobbing in its own glow. */
  drawGoal(g: CanvasRenderingContext2D, t: number, eaten: number) {
    if (!this.sushi || !this.glow) return;
    const bob = Math.sin(t * 2.2) * 3;
    const x = GOAL.x;
    const y = SUMMIT.y - 6 + bob - 10;
    const fade = 1 - eaten;
    if (fade <= 0) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = (0.45 + Math.sin(t * 3) * 0.08) * fade;
    drawSprite(g, this.glow, x, y - 26, 1.5, 1.3);
    g.restore();
    g.save();
    g.globalAlpha = fade;
    const s = 0.82 + eaten * 0.3;
    g.translate(x, y);
    g.rotate(Math.sin(t * 1.6) * 0.04);
    drawSprite(g, this.sushi, 0, 0, s, s);
    g.restore();
    // Twinkles circling the dish.
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const a = t * 0.9 + (i / 5) * TAU;
      const px = x + Math.cos(a) * 46;
      const py = y - 28 + Math.sin(a) * 16;
      const tw = Math.max(0, Math.sin(t * 4 + i * 2));
      g.globalAlpha = tw * fade * 0.9;
      sparkle(g, px, py, 2 + tw * 3.5);
    }
    g.restore();
  }

  /** Floating dust, the near columns and the lens: drawn in view space. */
  drawFront(g: CanvasRenderingContext2D, view: View, t: number) {
    const { viewW, viewH } = view;
    this.drawShafts(g, view, t, 0.55, 2);
    if (this.mote) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const fw = viewW + 120;
      const fh = viewH + 120;
      for (const m of this.motes) {
        const drift = t * m.drift;
        let x = (m.u * fw - view.camX * m.d + drift) % fw;
        let y = (m.v * fh - view.camY * m.d - t * 4 * m.sp) % fh;
        if (x < 0) x += fw;
        if (y < 0) y += fh;
        x -= 60;
        y -= 60;
        const near = m.d > 1.2;
        const size = m.r * (near ? 5 : 2.2) * m.d;
        const tw = 0.55 + 0.45 * Math.sin(t * m.sp * 2 + m.tw);
        g.globalAlpha = (near ? 0.12 : 0.5) * tw * (0.6 + 0.4 * (1 - y / viewH));
        drawSprite(g, this.mote, x, y, size / 16, size / 16);
      }
      g.restore();
    }
    if (this.fgColumn) {
      const p = this.par(view, FG_F);
      const period = 1500;
      for (const [side, base] of [
        [-1, 10],
        [1, WORLD_W - 10],
      ] as const) {
        const x = base + p.x + side * 30;
        const offset = side < 0 ? 0 : period / 2;
        const scroll = (((view.camY * FG_F + offset) % period) + period) % period;
        for (let k = -1; k < 2; k++) {
          const y = k * period - scroll + 200;
          if (y > viewH || y + 900 < 0) continue;
          g.globalAlpha = 0.92;
          drawSprite(g, this.fgColumn, x, y);
        }
      }
      g.globalAlpha = 1;
    }
    this.drawVignette(g, view);
  }

  /** Darken the edges only; the middle of the screen is never touched. */
  private drawVignette(g: CanvasRenderingContext2D, view: View) {
    const { viewW: w, viewH: h } = view;
    const edge = (x0: number, y0: number, x1: number, y1: number, a: number) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(6, 10, 14, ${a})`);
      gr.addColorStop(1, "rgba(6, 10, 14, 0)");
      return gr;
    };
    const ew = w * 0.2;
    const eh = h * 0.22;
    g.fillStyle = edge(0, 0, ew, 0, 0.5);
    g.fillRect(0, 0, ew, h);
    g.fillStyle = edge(w, 0, w - ew, 0, 0.5);
    g.fillRect(w - ew, 0, ew, h);
    g.fillStyle = edge(0, h, 0, h - eh, 0.55);
    g.fillRect(0, h - eh, w, eh);
    // The top edge warms as the crown gets closer.
    const range = Math.max(1, WORLD_H - h);
    const high = 1 - view.camY / range;
    const warm = g.createLinearGradient(0, 0, 0, eh * 1.4);
    warm.addColorStop(0, `rgba(255, 214, 150, ${0.05 + 0.13 * high})`);
    warm.addColorStop(1, "rgba(255, 214, 150, 0)");
    g.fillStyle = warm;
    g.fillRect(0, 0, w, eh * 1.4);
    g.fillStyle = edge(0, 0, 0, eh * 0.7, 0.3 * (1 - high));
    g.fillRect(0, 0, w, eh * 0.7);
  }
}

/** Four-point star for twinkles. */
export function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = "#fff6d0";
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.15, y - r * 0.15, x + r, y);
  g.quadraticCurveTo(x + r * 0.15, y + r * 0.15, x, y + r);
  g.quadraticCurveTo(x - r * 0.15, y + r * 0.15, x - r, y);
  g.quadraticCurveTo(x - r * 0.15, y - r * 0.15, x, y - r);
  g.fill();
}
