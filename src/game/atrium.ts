export type Phase = "title" | "play" | "won";

export type Engine = {
  destroy: () => void;
  setKey: (code: string, down: boolean) => void;
  start: () => void;
  reset: () => void;
};

type Kind = "floor" | "tree";
type Side = "left" | "right";

type Platform = {
  x: number;
  y: number;
  w: number;
  solid: boolean;
  kind: Kind;
  side: Side;
};

type Player = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  onSolid: boolean;
  drop: number;
  coyote: number;
  airLo: number;
  airHi: number;
  launchVx: number;
  anim: "idle" | "run" | "jump";
  frame: number;
  frameT: number;
  jumpT: number;
  squash: number;
};

type Puff = { x: number; y: number; life: number; vx: number; vy: number; r: number; gold: boolean };

const WORLD_H = 2400;
const FLOOR_Y = 2160;
const PERCH_W = 250;
const GAP = 220;
const MARGIN = 160;
const LEFT_X = MARGIN;
const RIGHT_X = LEFT_X + PERCH_W + GAP;
const WORLD_W = RIGHT_X + PERCH_W + MARGIN;
const RISE = 165;
const FIRST = 152;
const COUNT = 9;
const PW = 42;
const PH = 34;
// Run is 20% faster than the Mario pass. The jump falls sooner, and the air
// window opens on the way down so the landing can be steered.
const WALK_VX = 5.04;
const RUN_VX = 8.4;
const ACCEL = 0.26;
const FRICTION = 0.75;
const PIVOT = 0.48;
const JUMP_V = -14.4;
const GRAV_RISE = 0.52;
const GRAV_HANG = 0.58;
const GRAV_FALL = 1.5;
const APEX = 2.8;
const MAX_FALL = 14.5;
const BRAKE = 2.4;
const EXTRA = 1.15;
const FALL_DRIFT = 3.8;
const RISE_STEER = 0.3;
const FALL_STEER = 0.52;
const COYOTE = 5;
const STEP = 1 / 60;

const LEFT_STAND = 0.058;
const RIGHT_STAND = 0.069;

function buildPlatforms(): Platform[] {
  const list: Platform[] = [
    { x: 0, y: FLOOR_Y, w: WORLD_W, solid: true, kind: "floor", side: "left" },
  ];
  for (let i = 0; i < COUNT; i++) {
    const side: Side = i % 2 === 0 ? "left" : "right";
    list.push({
      x: side === "left" ? LEFT_X : RIGHT_X,
      y: FLOOR_Y - FIRST - i * RISE,
      w: PERCH_W,
      solid: false,
      kind: "tree",
      side,
    });
  }
  return list;
}

const PLATFORMS = buildPlatforms();
const SUMMIT = PLATFORMS[PLATFORMS.length - 1]!;

function approach(value: number, target: number, accel: number) {
  if (value < target) return Math.min(target, value + accel);
  if (value > target) return Math.max(target, value - accel);
  return value;
}

function asset(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function makePlayer(): Player {
  return {
    x: LEFT_X + 6,
    y: FLOOR_Y - FIRST - PH,
    w: PW,
    h: PH,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    onSolid: true,
    drop: 0,
    coyote: COYOTE,
    airLo: -4,
    airHi: 4,
    launchVx: 0,
    anim: "idle",
    frame: 0,
    frameT: 0,
    jumpT: 1,
    squash: 0,
  };
}

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getY: () => number;
      getBottom: () => number;
      getGrounded: () => boolean;
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      getPhase: () => Phase;
    };
  }
}

export async function startAtrium(
  canvas: HTMLCanvasElement,
  onPhase: (phase: Phase) => void,
): Promise<Engine> {
  const [idle, run, jump, perchL, perchR, sushiImg, bgLower, bgMid, bgUpper] = await Promise.all([
    Promise.all([1, 2, 3, 4].map((n) => loadImage(asset(`/game/olive-idle-${n}.png?v=4`)))),
    Promise.all([1, 2, 3, 4, 5, 6].map((n) => loadImage(asset(`/game/olive-run-${n}.png?v=4`)))),
    Promise.all([1, 2, 3, 4].map((n) => loadImage(asset(`/game/olive-jump-${n}.png?v=4`)))),
    loadImage(asset("/game/perch-left.png")),
    loadImage(asset("/game/perch-right.png")),
    loadImage(asset("/game/sushi.png")),
    loadImage(asset("/game/bg-lower.jpg")),
    loadImage(asset("/game/bg-mid.jpg")),
    loadImage(asset("/game/bg-upper.jpg")),
  ]);

  const sheets = { idle, run, jump };
  const real = new Set<string>();
  const injected = new Set<string>();
  let phase: Phase = "title";
  let player = makePlayer();
  let camX = 0;
  let camY = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let wasJump = false;
  let wasDown = false;
  let time = 0;
  let shake = 0;
  const puffs: Puff[] = [];
  let audio: AudioContext | null = null;

  const mineX = () => player.x;
  const held = (code: string) => real.has(code) || injected.has(code);

  function setPhase(next: Phase) {
    phase = next;
    onPhase(next);
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain = 0.05) {
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  }

  function unlock() {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  }

  function burst(x: number, y: number, n: number, gold = false) {
    for (let i = 0; i < n; i++) {
      puffs.push({
        x,
        y,
        life: 0.4 + Math.random() * 0.28,
        vx: (Math.random() - 0.5) * 180,
        vy: -30 - Math.random() * 140,
        r: 2.5 + Math.random() * 3.5,
        gold,
      });
    }
  }

  function reset() {
    player = makePlayer();
    puffs.length = 0;
    wasJump = false;
    wasDown = false;
    shake = 0;
    setPhase("play");
  }

  function begin() {
    unlock();
    if (phase === "title") setPhase("play");
  }

  function step(dt: number) {
    time += dt;
    const playing = phase === "play";
    const left = playing && (held("ArrowLeft") || held("KeyA"));
    const right = playing && (held("ArrowRight") || held("KeyD"));
    const jumpNow = playing && (held("Space") || held("KeyW") || held("ArrowUp") || held("KeyZ"));
    const downNow = playing && (held("KeyS") || held("ArrowDown"));
    const runHeld =
      playing && (held("ShiftLeft") || held("ShiftRight") || held("KeyX") || held("KeyB"));

    if (!playing) {
      player.vx = 0;
      player.vy = 0;
      player.grounded = true;
    } else {
      let target = 0;
      if (right) target = runHeld ? RUN_VX : WALK_VX;
      else if (left) target = runHeld ? -RUN_VX : -WALK_VX;
      if (target !== 0) player.facing = target > 0 ? 1 : -1;

      if (player.grounded) {
        if (target !== 0) {
          const turning = Math.sign(target) !== Math.sign(player.vx) && Math.abs(player.vx) > 0.2;
          player.vx = approach(player.vx, target, turning ? PIVOT : ACCEL);
        } else {
          player.vx = approach(player.vx, 0, FRICTION);
        }
        player.launchVx = player.vx;
        player.airLo = player.vx - (BRAKE + 1);
        player.airHi = player.vx + (BRAKE + 1);
      }

      const jumpEdge = jumpNow && !wasJump;
      const jumped = jumpEdge && player.drop <= 0 && (player.grounded || player.coyote > 0);
      if (jumped) {
        const spd = player.vx;
        player.vy = JUMP_V;
        player.grounded = false;
        player.coyote = 0;
        player.launchVx = spd;
        player.airLo = spd - (spd >= 0 ? BRAKE : EXTRA);
        player.airHi = spd + (spd >= 0 ? EXTRA : BRAKE);
        if (Math.abs(spd) < 2.2) {
          player.airLo = Math.min(player.airLo, -2.6);
          player.airHi = Math.max(player.airHi, 2.6);
        }
        player.jumpT = 0;
        player.squash = 0.16;
        tone(540, 0.07, "triangle", 0.035);
      }

      if (!player.grounded) {
        const falling = player.vy > 0.4;
        const steer = falling ? FALL_STEER : RISE_STEER;
        if (left) player.vx -= steer;
        else if (right) player.vx += steer;
        if (falling) {
          player.airLo = Math.max(player.launchVx - FALL_DRIFT, player.airLo - 0.16);
          player.airHi = Math.min(player.launchVx + FALL_DRIFT, player.airHi + 0.16);
        }
        player.vx = Math.max(player.airLo, Math.min(player.airHi, player.vx));
      }

      player.x += player.vx;
      if (player.x < 8) {
        player.x = 8;
        player.vx = 0;
      }
      if (player.x + player.w > WORLD_W - 8) {
        player.x = WORLD_W - 8 - player.w;
        player.vx = 0;
      }

      if (player.grounded && player.drop <= 0) {
        let on = false;
        const bottom = player.y + player.h;
        for (const p of PLATFORMS) {
          const overlap = player.x + player.w > p.x + 2 && player.x < p.x + p.w - 2;
          if (overlap && Math.abs(bottom - p.y) <= 3) {
            on = true;
            player.onSolid = p.solid;
            break;
          }
        }
        if (!on) {
          player.grounded = false;
          player.onSolid = false;
          player.vy = 0;
          player.coyote = COYOTE;
        }
      }

      if (downNow && !wasDown && player.grounded && !player.onSolid) {
        player.drop = 0.16;
        player.y += 8;
        player.vy = 1;
        player.grounded = false;
      }

      const prevBottom = player.y + player.h;
      if (!jumped && !player.grounded) {
        const grav = jumpNow && player.vy < -APEX ? GRAV_RISE : jumpNow && player.vy < 0 ? GRAV_HANG : GRAV_FALL;
        player.vy = Math.min(MAX_FALL, player.vy + grav);
        player.y += player.vy;
        player.coyote = Math.max(0, player.coyote - 1);
      } else if (player.grounded) {
        player.vy = 0;
        player.coyote = COYOTE;
      }

      let landed: Platform | null = null;
      if (player.drop > 0) player.drop -= dt;
      else if (!jumped && player.vy >= 0) {
        for (const p of PLATFORMS) {
          const overlap = player.x + player.w > p.x + 2 && player.x < p.x + p.w - 2;
          if (!overlap) continue;
          if (prevBottom <= p.y + 5 && player.y + player.h >= p.y && player.y + player.h <= p.y + 28) {
            if (!landed || p.y < landed.y) landed = p;
          }
        }
      }

      if (landed) {
        const impact = player.vy;
        player.y = landed.y - player.h;
        player.vy = 0;
        if (!player.grounded && impact > 5) {
          player.squash = -0.14;
          shake = Math.min(5, impact / 3);
          burst(player.x + player.w / 2, landed.y, 4, true);
          tone(160, 0.04, "sine", 0.025);
        }
        player.grounded = true;
        player.onSolid = landed.solid;
        player.coyote = COYOTE;
      } else if (!player.grounded) {
        player.onSolid = false;
      }

      if (player.y > WORLD_H + 40) {
        player.x = LEFT_X + 6;
        player.y = FLOOR_Y - FIRST - PH;
        player.vx = 0;
        player.vy = 0;
        player.grounded = true;
      }

      const sx = SUMMIT.x + SUMMIT.w * 0.62;
      const sy = SUMMIT.y - 54;
      const onSummit =
        player.grounded &&
        player.x + player.w > SUMMIT.x + 4 &&
        player.x < SUMMIT.x + SUMMIT.w - 4 &&
        Math.abs(player.y + player.h - SUMMIT.y) < 8;
      const dx = sx - (player.x + player.w / 2);
      const dy = sy - (player.y + player.h * 0.35);
      if (onSummit && dx * dx + dy * dy < 72 * 72) {
        setPhase("won");
        burst(sx, sy, 18, true);
        tone(620, 0.1, "triangle", 0.045);
        tone(830, 0.16, "sine", 0.035);
      }
    }

    player.jumpT += dt;
    if (!player.grounded && playing) {
      player.anim = "jump";
      if (player.jumpT < 0.06) player.frame = 0;
      else if (player.vy < -APEX) player.frame = 1;
      else if (player.vy < 2) player.frame = 2;
      else player.frame = 3;
    } else if (Math.abs(player.vx) > ACCEL) {
      if (player.anim !== "run") {
        player.anim = "run";
        player.frameT = 0;
      }
      player.frameT += 1;
      const units = Math.min(40, Math.round(Math.abs(player.vx) / ACCEL));
      const delay = Math.max(4, 12 - Math.floor((units * 8) / 40));
      if (player.frameT >= delay) {
        player.frameT = 0;
        player.frame = (player.frame + 1) % run.length;
      }
    } else {
      if (player.anim !== "idle") {
        player.anim = "idle";
        player.frame = 0;
        player.frameT = 0;
      }
      player.frameT += dt;
      if (player.frameT > 0.2) {
        player.frameT = 0;
        player.frame = (player.frame + 1) % idle.length;
      }
    }

    player.squash += (0 - player.squash) * Math.min(1, dt * 12);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const puff = puffs[i]!;
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.vy += 280 * dt;
      if (puff.life <= 0) puffs.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 16);

    wasJump = jumpNow;
    wasDown = downNow;

    const focusX = player.x + player.w / 2 + player.facing * 170;
    const focusY = player.y - 30;
    const { viewW, viewH } = viewSize();
    const destX = Math.max(0, Math.min(WORLD_W - viewW, focusX - viewW * 0.4));
    const destY = Math.max(0, Math.min(WORLD_H - viewH, focusY - viewH * 0.58));
    const k = 1 - Math.exp(-dt * 6.5);
    camX += (destX - camX) * k;
    camY += (destY - camY) * k;
  }

  function viewSize() {
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight);
    const viewW = Math.min(WORLD_W, Math.max(800, cssW * 0.8));
    const viewH = cssH * (viewW / cssW);
    return { viewW, viewH, cssW, cssH };
  }

  function drawBand(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    destY: number,
    destH: number,
    focus: number,
  ) {
    const scale = WORLD_W / img.width;
    let srcH = destH / scale;
    if (srcH > img.height) srcH = img.height;
    const maxY = img.height - srcH;
    const srcY = Math.max(0, Math.min(maxY, maxY * focus));
    ctx.drawImage(img, 0, srcY, img.width, srcH, 0, destY, WORLD_W, destH);
  }

  function drawPosts(ctx: CanvasRenderingContext2D, side: Side) {
    const perches = PLATFORMS.filter((p) => p.kind === "tree" && p.side === side);
    const top = Math.min(...perches.map((p) => p.y)) - 28;
    const x0 = side === "left" ? LEFT_X : RIGHT_X;
    const honey = side === "left";
    const slots = [0.2, 0.5, 0.8];
    for (const t of slots) {
      const w = t === 0.5 ? 28 : 18;
      const x = x0 + PERCH_W * t - w / 2;
      const y = top;
      const h = FLOOR_Y - top + 8;
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      if (honey) {
        grad.addColorStop(0, "#f3d7a2");
        grad.addColorStop(0.45, "#d3924a");
        grad.addColorStop(1, "#8d5524");
      } else {
        grad.addColorStop(0, "#a86448");
        grad.addColorStop(0.5, "#6a3828");
        grad.addColorStop(1, "#3c2018");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = honey ? "rgba(120, 72, 28, 0.28)" : "rgba(255, 196, 140, 0.16)";
      ctx.lineWidth = 1.4;
      for (let yy = y + 8; yy < y + h; yy += 16) {
        ctx.beginPath();
        ctx.moveTo(x - 2, yy);
        ctx.lineTo(x + w + 2, yy + 9);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = honey ? "rgba(255, 236, 200, 0.35)" : "rgba(255, 210, 170, 0.18)";
      ctx.fillRect(x + 3, y + 6, 3, h - 14);
    }
    const baseW = PERCH_W * 0.72;
    const bx = x0 + (PERCH_W - baseW) / 2;
    const g = ctx.createLinearGradient(bx, FLOOR_Y - 18, bx, FLOOR_Y + 22);
    g.addColorStop(0, honey ? "#e7c48a" : "#7a4634");
    g.addColorStop(1, honey ? "#8a5428" : "#3a2018");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(bx, FLOOR_Y - 16, baseW, 36, 10);
    ctx.fill();
  }

  function draw() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { viewW, viewH, cssW, cssH } = viewSize();
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(bw / viewW, 0, 0, bh / viewH, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    const ox = Math.round(camX + jx);
    const oy = Math.round(camY + jy);

    ctx.save();
    ctx.translate(-ox, -oy);

    const band = FLOOR_Y / 3;
    drawBand(ctx, bgUpper, 0, band + 2, 0.2);
    drawBand(ctx, bgMid, band, band + 2, 0.45);
    drawBand(ctx, bgLower, band * 2, FLOOR_Y - band * 2 + 2, 0.28);

    const sky = ctx.createLinearGradient(WORLD_W * 0.5, 0, WORLD_W * 0.5, FLOOR_Y);
    sky.addColorStop(0, "rgba(255, 196, 120, 0.05)");
    sky.addColorStop(0.5, "rgba(16, 48, 36, 0)");
    sky.addColorStop(1, "rgba(12, 28, 22, 0.12)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_W, FLOOR_Y);

    drawPosts(ctx, "left");
    drawPosts(ctx, "right");

    const marble = ctx.createLinearGradient(0, FLOOR_Y, 0, WORLD_H);
    marble.addColorStop(0, "#f4e6c8");
    marble.addColorStop(0.35, "#e7d3aa");
    marble.addColorStop(1, "#b88958");
    ctx.fillStyle = marble;
    ctx.fillRect(0, FLOOR_Y, WORLD_W, WORLD_H - FLOOR_Y);
    ctx.strokeStyle = "rgba(90, 140, 110, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y + 46);
    ctx.bezierCurveTo(280, FLOOR_Y + 20, 640, FLOOR_Y + 80, WORLD_W, FLOOR_Y + 36);
    ctx.stroke();
    ctx.fillStyle = "#e2b15a";
    ctx.fillRect(0, FLOOR_Y, WORLD_W, 8);
    ctx.fillStyle = "#8d3148";
    ctx.fillRect(0, FLOOR_Y + 8, WORLD_W, 3);

    for (const p of PLATFORMS) {
      if (p.kind !== "tree") continue;
      const img = p.side === "left" ? perchL : perchR;
      const stand = p.side === "left" ? LEFT_STAND : RIGHT_STAND;
      const dw = p.w * 1.06;
      const dh = dw * (p.side === "left" ? 118 / 520 : 108 / 520);
      const dx = p.x + p.w / 2 - dw / 2;
      const dy = p.y - dh * stand;
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    const sx = SUMMIT.x + SUMMIT.w * 0.62;
    const sy = SUMMIT.y - 56 + Math.sin(time * 2.4) * 6;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.sin(time * 1.6) * 0.05);
    const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 54);
    glow.addColorStop(0, "rgba(255, 186, 96, 0.55)");
    glow.addColorStop(1, "rgba(255, 186, 96, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.fill();
    const sw = 78;
    ctx.drawImage(sushiImg, -sw / 2, -sw * 0.42, sw, sw * 0.84);
    ctx.restore();

    for (const puff of puffs) {
      ctx.globalAlpha = Math.max(0, puff.life * 2.1);
      ctx.fillStyle = puff.gold ? "#f0c36a" : "#f7edd9";
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const frame = sheets[player.anim][player.frame % sheets[player.anim].length]!;
    const dh = 128;
    const dw = dh * (frame.naturalWidth / frame.naturalHeight);
    const feetX = player.x + player.w / 2;
    const feetY = player.y + player.h;
    const syScale = 1 + player.squash;
    ctx.save();
    ctx.translate(feetX, feetY);
    ctx.scale(player.facing * (2 - syScale), syScale);
    if (player.grounded) {
      ctx.fillStyle = "rgba(28, 24, 16, 0.22)";
      ctx.beginPath();
      ctx.ellipse(0, 3, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(frame, -dw / 2, -dh + 8, dw, dh);
    ctx.restore();
    ctx.restore();

    const sun = ctx.createRadialGradient(viewW * 0.5, viewH * 0.02, 10, viewW * 0.5, viewH * 0.22, viewH * 0.75);
    sun.addColorStop(0, "rgba(255, 214, 150, 0.2)");
    sun.addColorStop(0.45, "rgba(255, 196, 120, 0.05)");
    sun.addColorStop(1, "rgba(255, 196, 120, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function frameLoop(now: number) {
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += delta;
    let guard = 0;
    while (acc >= STEP && guard < 5) {
      step(STEP);
      acc -= STEP;
      guard++;
    }
    draw();
    window.__controlsTest = probe;
    raf = requestAnimationFrame(frameLoop);
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    real.add(e.code);
    if (phase === "title" && !e.repeat) begin();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    real.delete(e.code);
  };
  const onBlur = () => {
    real.clear();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const probe = {
    getX: mineX,
    getY: () => player.y,
    getBottom: () => player.y + player.h,
    getGrounded: () => player.grounded,
    getYaw: () => player.facing,
    getSpeed: () => Math.abs(player.vx),
    setKeys: (codes: string[]) => {
      injected.clear();
      for (const c of codes) injected.add(c);
      if (phase === "title" && codes.length) begin();
    },
    getPhase: () => phase,
  };
  window.__controlsTest = probe;

  const { viewW, viewH } = viewSize();
  camX = Math.max(0, Math.min(WORLD_W - viewW, player.x - viewW * 0.28));
  camY = Math.max(0, Math.min(WORLD_H - viewH, player.y - viewH * 0.62));
  onPhase("title");
  raf = requestAnimationFrame(frameLoop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (window.__controlsTest === probe) delete window.__controlsTest;
    },
    setKey(code: string, down: boolean) {
      if (down) {
        real.add(code);
        if (phase === "title") begin();
      } else real.delete(code);
    },
    start: begin,
    reset,
  };
}
