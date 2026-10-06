/**
 * Painters for the atrium's props. Each one draws in local world units, so a
 * sprite can be baked at whatever pixel density the screen needs and stay
 * sharp from a phone up to a 4K monitor.
 */

export type Sprite = {
  canvas: HTMLCanvasElement;
  /** Local origin inside the sprite, in world units. */
  ox: number;
  oy: number;
  w: number;
  h: number;
  res: number;
};

export type Velvet = { base: string; light: string; dark: string; piping: string };

export const EMERALD: Velvet = {
  base: "#1d6a4a",
  light: "#46a274",
  dark: "#0b3324",
  piping: "#ecd394",
};

export const CRIMSON: Velvet = {
  base: "#8c1d35",
  light: "#c94d63",
  dark: "#480a19",
  piping: "#ecd394",
};

const TAU = Math.PI * 2;

export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas unavailable");
  return g;
}

/** Bake a painter into a sprite. Local coords span (-ox..w-ox, -oy..h-oy). */
export function makeSprite(
  w: number,
  h: number,
  ox: number,
  oy: number,
  res: number,
  paint: (g: CanvasRenderingContext2D) => void,
): Sprite {
  const c = canvas(w * res, h * res);
  const g = ctx2d(c);
  g.scale(res, res);
  g.translate(ox, oy);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.save();
  paint(g);
  g.restore();
  return { canvas: c, ox, oy, w, h, res };
}

export function drawSprite(
  g: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  sx = 1,
  sy = 1,
) {
  g.drawImage(s.canvas, x - s.ox * sx, y - s.oy * sy, s.w * sx, s.h * sy);
}

/** A copy of the sprite with a solid silhouette outline around it. */
export function outlined(s: Sprite, color: string, width: number): Sprite {
  const pad = width;
  const W = s.w + pad * 2;
  const H = s.h + pad * 2;
  const r = width * s.res;
  const sil = canvas(W * s.res, H * s.res);
  const g = ctx2d(sil);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    g.drawImage(s.canvas, pad * s.res + Math.cos(a) * r, pad * s.res + Math.sin(a) * r);
  }
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, sil.width, sil.height);
  g.globalCompositeOperation = "source-over";
  g.drawImage(s.canvas, pad * s.res, pad * s.res);
  return { canvas: sil, ox: s.ox + pad, oy: s.oy + pad, w: W, h: H, res: s.res };
}

/** Whether `ctx.filter` blurs here (Chrome, Firefox, Safari 18+). */
let filterOk: boolean | undefined;
export function canFilter(): boolean {
  if (filterOk !== undefined) return filterOk;
  try {
    const c = canvas(8, 8);
    const g = ctx2d(c);
    g.filter = "blur(2px)";
    g.fillStyle = "#fff";
    g.fillRect(3, 3, 2, 2);
    filterOk = g.getImageData(0, 0, 1, 1).data[3]! > 0 || g.getImageData(2, 2, 1, 1).data[3]! > 0;
  } catch {
    filterOk = false;
  }
  return filterOk;
}

/** Blur a canvas in place by `px` device pixels, with a down/up-sample fallback. */
export function blurCanvas(c: HTMLCanvasElement, px: number) {
  if (px <= 0.3) return;
  const tmp = canvas(c.width, c.height);
  const t = ctx2d(tmp);
  t.drawImage(c, 0, 0);
  const g = ctx2d(c);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.clearRect(0, 0, c.width, c.height);
  if (canFilter()) {
    g.filter = `blur(${px}px)`;
    g.drawImage(tmp, 0, 0);
    g.filter = "none";
  } else {
    const k = Math.max(1.5, px / 1.5);
    const small = canvas(c.width / k, c.height / k);
    const s = ctx2d(small);
    s.imageSmoothingQuality = "high";
    s.drawImage(tmp, 0, 0, small.width, small.height);
    g.imageSmoothingQuality = "high";
    g.drawImage(small, 0, 0, c.width, c.height);
  }
  g.restore();
}

/* ------------------------------------------------------------------------ */
/* Cushions                                                                  */
/* ------------------------------------------------------------------------ */

export const CUSHION_HALF = 134;

/**
 * A tufted velvet cushion on a walnut shelf. The perch's standing line is
 * y = 0, which falls across the cushion's top so paws sink in a little.
 */
export function paintCushion(g: CanvasRenderingContext2D, v: Velvet, seed: number) {
  const rand = rng(seed);
  // Shelf.
  const shelf = g.createLinearGradient(0, 19, 0, 32);
  shelf.addColorStop(0, "#7a4a2c");
  shelf.addColorStop(0.5, "#56321d");
  shelf.addColorStop(1, "#2f1a0f");
  g.fillStyle = "rgba(10, 6, 4, 0.35)";
  g.beginPath();
  g.roundRect(-126, 24, 252, 12, 5);
  g.fill();
  g.fillStyle = shelf;
  g.beginPath();
  g.roundRect(-128, 18, 256, 13, 4);
  g.fill();
  g.strokeStyle = "#e6be6c";
  g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(-125, 19.2);
  g.lineTo(125, 19.2);
  g.stroke();
  g.strokeStyle = "rgba(255, 230, 170, 0.35)";
  g.lineWidth = 0.6;
  for (let i = 0; i < 9; i++) {
    const y = 22 + rand() * 7;
    g.beginPath();
    g.moveTo(-120 + rand() * 40, y);
    g.bezierCurveTo(-40, y + rand() * 2 - 1, 40, y + rand() * 2 - 1, 120 - rand() * 40, y);
    g.stroke();
  }

  // Pillow body: flat top, bulging ends and belly.
  const body = new Path2D();
  body.moveTo(-118, -10);
  body.bezierCurveTo(-60, -12.5, 60, -12.5, 118, -10);
  body.bezierCurveTo(132, -9, 136, 2, 134, 9);
  body.bezierCurveTo(133, 18, 126, 23, 116, 23.5);
  body.bezierCurveTo(60, 26.5, -60, 26.5, -116, 23.5);
  body.bezierCurveTo(-126, 23, -133, 18, -134, 9);
  body.bezierCurveTo(-136, 2, -132, -9, -118, -10);
  body.closePath();
  g.save();
  g.shadowColor = "rgba(5, 3, 8, 0.45)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 3;
  g.fillStyle = v.base;
  g.fill(body);
  g.restore();

  g.save();
  g.clip(body);
  const face = g.createLinearGradient(0, -12, 0, 26);
  face.addColorStop(0, v.light);
  face.addColorStop(0.32, v.light);
  face.addColorStop(0.4, v.base);
  face.addColorStop(0.75, v.base);
  face.addColorStop(1, v.dark);
  g.fillStyle = face;
  g.fill(body);
  // Rounded ends fall into shade.
  const ends = g.createLinearGradient(-136, 0, 136, 0);
  ends.addColorStop(0, "rgba(0, 0, 0, 0.38)");
  ends.addColorStop(0.1, "rgba(0, 0, 0, 0)");
  ends.addColorStop(0.88, "rgba(0, 0, 0, 0)");
  ends.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  g.fillStyle = ends;
  g.fill(body);
  // Velvet nap: fine vertical streaks.
  for (let i = 0; i < 260; i++) {
    const x = -132 + rand() * 264;
    const y = -10 + rand() * 34;
    g.strokeStyle = rand() < 0.5 ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.07)";
    g.lineWidth = 0.6 + rand();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5), y + 2 + rand() * 4);
    g.stroke();
  }
  // Sheen across the top where the window light catches the pile.
  const sheen = g.createLinearGradient(0, -11, 0, 2);
  sheen.addColorStop(0, "rgba(255, 245, 225, 0.32)");
  sheen.addColorStop(1, "rgba(255, 245, 225, 0)");
  g.fillStyle = sheen;
  g.fillRect(-130, -12, 260, 14);
  // Tufts on the top surface.
  for (const x of [-72, -24, 24, 72]) {
    const d = g.createRadialGradient(x, -4, 0.5, x, -4, 9);
    d.addColorStop(0, "rgba(0, 0, 0, 0.16)");
    d.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = d;
    g.beginPath();
    g.ellipse(x, -4, 10, 4, 0, 0, TAU);
    g.fill();
  }
  // Buttons and creases on the front face.
  for (const x of [-96, -48, 0, 48, 96]) {
    const y = 14;
    const d = g.createRadialGradient(x, y, 0.5, x, y, 11);
    d.addColorStop(0, "rgba(0, 0, 0, 0.24)");
    d.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = d;
    g.beginPath();
    g.ellipse(x, y, 13, 8, 0, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(0, 0, 0, 0.1)";
    g.lineWidth = 1.1;
    for (const [dx, dy] of [
      [-9, -6],
      [9, -6],
      [-10, 5],
      [10, 5],
    ] as const) {
      g.beginPath();
      g.moveTo(x + dx * 0.25, y + dy * 0.25);
      g.quadraticCurveTo(x + dx * 0.6, y + dy * 0.2, x + dx, y + dy);
      g.stroke();
    }
    g.strokeStyle = "rgba(255, 255, 255, 0.12)";
    g.beginPath();
    g.moveTo(x - 7, y - 2);
    g.quadraticCurveTo(x, y - 6, x + 7, y - 2);
    g.stroke();
    g.fillStyle = v.dark;
    g.beginPath();
    g.arc(x, y, 2.4, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255, 255, 255, 0.45)";
    g.beginPath();
    g.arc(x - 0.7, y - 0.8, 0.9, 0, TAU);
    g.fill();
  }
  g.restore();

  // Piping cord between the top and the front face.
  const pipe = new Path2D();
  pipe.moveTo(-128, 2.5);
  pipe.bezierCurveTo(-60, 4.2, 60, 4.2, 128, 2.5);
  g.strokeStyle = "rgba(0, 0, 0, 0.35)";
  g.lineWidth = 3.4;
  g.save();
  g.translate(0, 1.4);
  g.stroke(pipe);
  g.restore();
  g.strokeStyle = v.piping;
  g.lineWidth = 2.4;
  g.stroke(pipe);
  g.strokeStyle = "rgba(255, 255, 255, 0.6)";
  g.lineWidth = 0.8;
  g.save();
  g.translate(0, -0.6);
  g.stroke(pipe);
  g.restore();
  g.strokeStyle = "rgba(120, 80, 30, 0.6)";
  g.lineWidth = 0.5;
  for (let x = -124; x < 124; x += 3) {
    const y = 2.5 + 1.7 * (1 - (x / 128) ** 2);
    g.beginPath();
    g.moveTo(x, y - 1);
    g.lineTo(x + 1.6, y + 1);
    g.stroke();
  }

  // Tassels on the front corners.
  for (const x of [-124, 124]) paintTassel(g, x, 16, 15, x);
}

export function paintTassel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  seed: number,
) {
  const rand = rng(Math.abs(seed) + 3);
  g.fillStyle = "#b9862f";
  for (let i = 0; i < 9; i++) {
    const dx = (i - 4) * 0.8;
    g.strokeStyle = i % 2 ? "#f0cd7a" : "#b9862f";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + dx * 0.5, y + 3);
    g.quadraticCurveTo(x + dx, y + len * 0.6, x + dx * 1.4 + (rand() - 0.5), y + len);
    g.stroke();
  }
  const cap = g.createRadialGradient(x - 1, y, 0.5, x, y + 1, 4.5);
  cap.addColorStop(0, "#fff0b8");
  cap.addColorStop(0.5, "#e1b354");
  cap.addColorStop(1, "#8d6320");
  g.fillStyle = cap;
  g.beginPath();
  g.ellipse(x, y + 2, 3.6, 4.2, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#8d6320";
  g.fillRect(x - 3.2, y + 5, 6.4, 1.4);
}

/* ------------------------------------------------------------------------ */
/* Sisal posts                                                               */
/* ------------------------------------------------------------------------ */

export const ROPE_TILE_W = 36;
export const ROPE_COIL = 6.5;

/** One seamless tile of helically wound sisal rope. */
export function paintRopeTile(g: CanvasRenderingContext2D, warm: boolean) {
  const base = warm ? "#c9a165" : "#b98d5a";
  const hi = warm ? "#f0d49b" : "#e2bf8a";
  const lo = warm ? "#7e5c33" : "#6c4b2c";
  const rand = rng(warm ? 11 : 23);
  g.fillStyle = base;
  g.fillRect(0, 0, ROPE_TILE_W, ROPE_COIL * 4);
  g.save();
  g.beginPath();
  g.rect(0, 0, ROPE_TILE_W, ROPE_COIL * 4);
  g.clip();
  g.transform(1, ROPE_COIL / ROPE_TILE_W, 0, 1, 0, 0);
  for (let j = -2; j < 7; j++) {
    const y = j * ROPE_COIL;
    const band = g.createLinearGradient(0, y, 0, y + ROPE_COIL);
    band.addColorStop(0, lo);
    band.addColorStop(0.18, hi);
    band.addColorStop(0.55, base);
    band.addColorStop(1, lo);
    g.fillStyle = band;
    g.fillRect(-2, y, ROPE_TILE_W + 4, ROPE_COIL);
    // Twist of the strands within each coil.
    g.strokeStyle = "rgba(90, 60, 30, 0.45)";
    g.lineWidth = 0.5;
    for (let x = -2; x < ROPE_TILE_W + 2; x += 2.25) {
      g.beginPath();
      g.moveTo(x, y + 0.6);
      g.lineTo(x + 1.6, y + ROPE_COIL - 0.6);
      g.stroke();
    }
  }
  g.restore();
  // Loose fibres.
  for (let i = 0; i < 40; i++) {
    const x = rand() * ROPE_TILE_W;
    const y = rand() * ROPE_COIL * 4;
    g.strokeStyle = rand() < 0.5 ? "rgba(255, 240, 200, 0.5)" : "rgba(70, 45, 20, 0.35)";
    g.lineWidth = 0.35;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 3, y + (rand() - 0.5) * 3);
    g.stroke();
  }
}

/* ------------------------------------------------------------------------ */
/* Drapes, banners, chandeliers                                              */
/* ------------------------------------------------------------------------ */

export const DRAPE_W = 130;
export const DRAPE_H = 600;

/** A velvet curtain hanging down the left wall, tied back. Mirror for the right. */
export function paintDrape(g: CanvasRenderingContext2D, seed: number) {
  const rand = rng(seed);
  const tie = DRAPE_H * 0.58;
  const shape = new Path2D();
  shape.moveTo(-10, 40);
  shape.lineTo(DRAPE_W, 40);
  shape.bezierCurveTo(DRAPE_W - 10, tie * 0.6, 60, tie - 40, 44, tie);
  shape.bezierCurveTo(56, tie + 60, 96, DRAPE_H - 80, 92, DRAPE_H);
  shape.lineTo(-10, DRAPE_H);
  shape.closePath();
  const base = g.createLinearGradient(0, 0, DRAPE_W, 0);
  base.addColorStop(0, "#3a0812");
  base.addColorStop(0.5, "#7c1a2e");
  base.addColorStop(1, "#561020");
  g.fillStyle = base;
  g.fill(shape);
  g.save();
  g.clip(shape);
  // Folds: soft dark valleys and lit ridges converging on the tie-back.
  const folds = 8;
  for (let i = 0; i < folds; i++) {
    const q = (i + 0.5) / folds;
    const x0 = -6 + q * (DRAPE_W + 4);
    const x1 = 6 + q * 36;
    const x2 = -6 + q * 98;
    const ridge = new Path2D();
    ridge.moveTo(x0, 40);
    ridge.bezierCurveTo(x0 - q * 10, tie * 0.55, x1 + 6, tie - 60, x1, tie);
    ridge.bezierCurveTo(x1 + 4, tie + 70, x2 - 4, DRAPE_H - 120, x2 + (rand() - 0.5) * 6, DRAPE_H);
    g.strokeStyle = "rgba(10, 0, 4, 0.4)";
    g.lineWidth = 9;
    g.stroke(ridge);
    g.save();
    g.translate(4, 0);
    g.strokeStyle = "rgba(255, 150, 160, 0.16)";
    g.lineWidth = 4;
    g.stroke(ridge);
    g.strokeStyle = "rgba(255, 210, 210, 0.12)";
    g.lineWidth = 1.4;
    g.stroke(ridge);
    g.restore();
  }
  const light = g.createLinearGradient(0, 0, 0, DRAPE_H);
  light.addColorStop(0, "rgba(255, 220, 160, 0.16)");
  light.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  g.fillStyle = light;
  g.fill(shape);
  g.restore();
  // Gold fringe along the hem.
  g.strokeStyle = "#d9ad55";
  g.lineWidth = 1;
  for (let x = -8; x < 92; x += 2.2) {
    g.beginPath();
    g.moveTo(x, DRAPE_H - 10);
    g.lineTo(x + (rand() - 0.5) * 1.2, DRAPE_H - 1);
    g.stroke();
  }
  g.fillStyle = "#c79a43";
  g.fillRect(-10, DRAPE_H - 13, 104, 4);

  // Tie-back: a gold cord with a big tassel.
  g.strokeStyle = "#8a6224";
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(-10, tie - 6);
  g.quadraticCurveTo(30, tie + 10, 56, tie - 2);
  g.stroke();
  g.strokeStyle = "#f0cc78";
  g.lineWidth = 2.2;
  g.stroke();
  paintTassel(g, 52, tie, 28, seed);

  // Pelmet with scalloped hem.
  const pel = new Path2D();
  pel.moveTo(-10, 0);
  pel.lineTo(DRAPE_W + 6, 0);
  pel.lineTo(DRAPE_W + 6, 44);
  const scallops = 3;
  const sw = (DRAPE_W + 16) / scallops;
  for (let i = scallops; i > 0; i--) {
    const xr = -10 + i * sw;
    const xl = xr - sw;
    pel.quadraticCurveTo((xl + xr) / 2, 70, xl, 44);
  }
  pel.closePath();
  const pg = g.createLinearGradient(0, 0, 0, 70);
  pg.addColorStop(0, "#9e2a40");
  pg.addColorStop(1, "#4d0b1a");
  g.fillStyle = pg;
  g.fill(pel);
  g.strokeStyle = "#e4bb63";
  g.lineWidth = 2;
  g.stroke(pel);
  g.fillStyle = "#e4bb63";
  g.fillRect(-10, 8, DRAPE_W + 16, 3);
}

export const CHANDELIER_W = 190;
export const CHANDELIER_H = 150;

export type Flame = { x: number; y: number };

/** A gilt chandelier hanging from the origin. Returns where its flames sit. */
export function paintChandelier(g: CanvasRenderingContext2D): Flame[] {
  const gold = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, "#fff0b0");
    gr.addColorStop(0.35, "#d8a948");
    gr.addColorStop(1, "#6e4c18");
    return gr;
  };
  // Chain.
  g.strokeStyle = "#7c5a22";
  g.lineWidth = 1.6;
  for (let y = 0; y < 44; y += 5) {
    g.beginPath();
    g.ellipse(0, y + 2.5, y % 10 ? 1.2 : 2.2, 2.6, 0, 0, TAU);
    g.stroke();
  }
  const flames: Flame[] = [];
  // Arms: two tiers of scrolls.
  const tiers = [
    { y: 92, xs: [34, 62, 86], drop: 18 },
    { y: 70, xs: [24, 48], drop: 12 },
  ];
  for (const tier of tiers) {
    for (const s of [-1, 1]) {
      for (const x of tier.xs) {
        g.strokeStyle = gold(0, tier.y - 20, 0, tier.y + 10);
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(0, tier.y - 6);
        g.bezierCurveTo(
          s * x * 0.35,
          tier.y + tier.drop,
          s * x * 0.8,
          tier.y + tier.drop,
          s * x,
          tier.y,
        );
        g.stroke();
        // Candle cup, candle and flame position.
        g.fillStyle = gold(s * x - 6, tier.y - 4, s * x + 6, tier.y + 4);
        g.beginPath();
        g.ellipse(s * x, tier.y, 6, 2.6, 0, 0, TAU);
        g.fill();
        const cg = g.createLinearGradient(s * x - 2.5, 0, s * x + 2.5, 0);
        cg.addColorStop(0, "#fffaf0");
        cg.addColorStop(1, "#d8cbb0");
        g.fillStyle = cg;
        g.fillRect(s * x - 2.2, tier.y - 15, 4.4, 14);
        flames.push({ x: s * x, y: tier.y - 19 });
        // Crystal drop.
        g.fillStyle = "rgba(235, 245, 255, 0.85)";
        g.beginPath();
        g.moveTo(s * x, tier.y + 3);
        g.lineTo(s * x + 2.2, tier.y + 9);
        g.lineTo(s * x, tier.y + 15);
        g.lineTo(s * x - 2.2, tier.y + 9);
        g.closePath();
        g.fill();
        g.fillStyle = "#ffffff";
        g.fillRect(s * x - 0.6, tier.y + 6, 1.2, 3);
      }
    }
  }
  // Swags of crystal beads between the lower arms.
  g.fillStyle = "rgba(240, 248, 255, 0.9)";
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const xa = s * [34, 62][k]!;
      const xb = s * [62, 86][k]!;
      for (let i = 0; i <= 8; i++) {
        const q = i / 8;
        const x = xa + (xb - xa) * q;
        const y = 94 + Math.sin(q * Math.PI) * 10;
        g.beginPath();
        g.arc(x, y, 1.1, 0, TAU);
        g.fill();
      }
    }
  }
  // Central column.
  g.fillStyle = gold(-10, 40, 10, 130);
  g.beginPath();
  g.moveTo(-3, 42);
  g.bezierCurveTo(-14, 60, -12, 80, -5, 92);
  g.bezierCurveTo(-16, 104, -12, 120, 0, 132);
  g.bezierCurveTo(12, 120, 16, 104, 5, 92);
  g.bezierCurveTo(12, 80, 14, 60, 3, 42);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255, 255, 255, 0.5)";
  g.beginPath();
  g.ellipse(-4, 70, 1.6, 9, 0, 0, TAU);
  g.fill();
  // Pendant crystal.
  g.fillStyle = "rgba(230, 242, 255, 0.95)";
  g.beginPath();
  g.moveTo(0, 130);
  g.lineTo(5, 140);
  g.lineTo(0, 150);
  g.lineTo(-5, 140);
  g.closePath();
  g.fill();
  return flames;
}

/** Hanging pennant with a gold paw crest. */
export function paintBanner(g: CanvasRenderingContext2D, w: number, h: number, color: string) {
  g.fillStyle = "#6e4c18";
  g.fillRect(-w / 2 - 8, -4, w + 16, 6);
  g.fillStyle = "#f0cd7a";
  g.beginPath();
  g.arc(-w / 2 - 9, -1, 4, 0, TAU);
  g.arc(w / 2 + 9, -1, 4, 0, TAU);
  g.fill();
  const shape = new Path2D();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h - 30);
  shape.lineTo(0, h);
  shape.lineTo(-w / 2, h - 30);
  shape.closePath();
  g.fillStyle = color;
  g.fill(shape);
  g.save();
  g.clip(shape);
  const sh = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  sh.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  sh.addColorStop(0.4, "rgba(255, 255, 255, 0.08)");
  sh.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  g.fillStyle = sh;
  g.fillRect(-w / 2, 0, w, h);
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = "rgba(0, 0, 0, 0.18)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-w / 2 + (i + 0.6) * (w / 4), 0);
    g.lineTo(-w / 2 + (i + 0.4) * (w / 4), h);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "#e4bb63";
  g.lineWidth = 2.5;
  g.stroke(shape);
  // Paw crest.
  const cy = h * 0.42;
  g.fillStyle = "#e9c46e";
  g.beginPath();
  g.ellipse(0, cy + 6, w * 0.16, w * 0.13, 0, 0, TAU);
  g.fill();
  for (const [dx, dy] of [
    [-0.19, -0.06],
    [-0.07, -0.17],
    [0.07, -0.17],
    [0.19, -0.06],
  ] as const) {
    g.beginPath();
    g.ellipse(dx * w, cy + dy * w, w * 0.055, w * 0.07, dx * 2, 0, TAU);
    g.fill();
  }
}

/* ------------------------------------------------------------------------ */
/* The salmon                                                                */
/* ------------------------------------------------------------------------ */

/** Salmon nigiri on a small gold dish. Origin at the bottom centre of the dish. */
export function paintSushi(g: CanvasRenderingContext2D) {
  const rand = rng(91);
  // Dish.
  const dish = g.createLinearGradient(0, -12, 0, 0);
  dish.addColorStop(0, "#fff2c0");
  dish.addColorStop(0.4, "#dcae52");
  dish.addColorStop(1, "#7b551b");
  g.fillStyle = "rgba(20, 10, 4, 0.35)";
  g.beginPath();
  g.ellipse(0, 0, 44, 6, 0, 0, TAU);
  g.fill();
  g.fillStyle = dish;
  g.beginPath();
  g.ellipse(0, -5, 44, 8.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#f6dc94";
  g.beginPath();
  g.ellipse(0, -7, 36, 5.5, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(255, 255, 255, 0.7)";
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(0, -6, 41, 7, 0, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();

  // Rice: a soft mound of grains.
  const rice = new Path2D();
  rice.moveTo(-30, -10);
  rice.bezierCurveTo(-34, -22, -24, -31, -8, -31);
  rice.bezierCurveTo(10, -32, 30, -28, 32, -16);
  rice.bezierCurveTo(33, -10, 28, -8, 20, -8);
  rice.lineTo(-22, -8);
  rice.bezierCurveTo(-28, -8, -30, -9, -30, -10);
  rice.closePath();
  g.fillStyle = "#f4efe4";
  g.fill(rice);
  g.save();
  g.clip(rice);
  for (let i = 0; i < 70; i++) {
    const x = -32 + rand() * 64;
    const y = -32 + rand() * 24;
    const a = rand() * Math.PI;
    g.fillStyle = "rgba(255, 255, 255, 0.95)";
    g.strokeStyle = "rgba(150, 140, 120, 0.45)";
    g.lineWidth = 0.4;
    g.beginPath();
    g.ellipse(x, y, 3, 1.6, a, 0, TAU);
    g.fill();
    g.stroke();
  }
  const rs = g.createLinearGradient(0, -32, 0, -8);
  rs.addColorStop(0, "rgba(255, 255, 255, 0)");
  rs.addColorStop(1, "rgba(120, 100, 90, 0.35)");
  g.fillStyle = rs;
  g.fillRect(-34, -34, 68, 28);
  g.restore();

  // Salmon slice draped over the top.
  const fish = new Path2D();
  fish.moveTo(-38, -14);
  fish.bezierCurveTo(-40, -30, -22, -44, 2, -44);
  fish.bezierCurveTo(24, -44, 40, -34, 40, -20);
  fish.bezierCurveTo(40, -15, 36, -13, 32, -16);
  fish.bezierCurveTo(18, -24, -10, -26, -30, -12);
  fish.bezierCurveTo(-34, -10, -37, -11, -38, -14);
  fish.closePath();
  const fg = g.createLinearGradient(-20, -44, 20, -12);
  fg.addColorStop(0, "#ffb07a");
  fg.addColorStop(0.45, "#ff7d47");
  fg.addColorStop(1, "#d8502c");
  g.fillStyle = fg;
  g.fill(fish);
  g.save();
  g.clip(fish);
  g.strokeStyle = "rgba(255, 244, 232, 0.85)";
  for (let i = 0; i < 8; i++) {
    const x = -40 + i * 11;
    g.lineWidth = 2.2 - (i % 2) * 0.8;
    g.beginPath();
    g.moveTo(x, -10);
    g.bezierCurveTo(x + 4, -24, x + 12, -34, x + 22, -46);
    g.stroke();
  }
  const gloss = g.createLinearGradient(0, -44, 0, -30);
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = gloss;
  g.beginPath();
  g.ellipse(-2, -39, 24, 4.5, -0.08, 0, TAU);
  g.fill();
  g.restore();
}

/** Soft round glow, white; tint with globalAlpha and composite mode. */
export function paintGlow(g: CanvasRenderingContext2D, r: number, color: string) {
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, color);
  gr.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.45)"));
  gr.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
}
