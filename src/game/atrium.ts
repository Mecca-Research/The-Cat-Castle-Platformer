import { Sound } from "./audio.ts";
import { Fx } from "./fx.ts";
import { FLOOR_Y, GOAL, PLATFORMS, SUMMIT, WORLD_H, WORLD_W, type Platform } from "./level.ts";
import { Olive } from "./olive.ts";
import {
  holdPlayer,
  makePlayer,
  NO_INPUT,
  stepPlayer,
  TUNING,
  type Input,
  type Player,
} from "./physics.ts";
import { Scene, type View } from "./scene.ts";

export type Phase = "title" | "play" | "won";

export type Engine = {
  destroy: () => void;
  setKey: (code: string, down: boolean) => void;
  start: () => void;
  reset: () => void;
};

const STEP = 1 / 60;
const TAU = Math.PI * 2;
/** Olive is drawn a little larger than her hitbox suggests, to show her off. */
const OLIVE_SCALE = 1.22;
/** How far ahead of Olive's middle her mouth reaches when she eats. */
const MOUTH = 50;

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["Space", "KeyW", "ArrowUp", "KeyZ"],
  down: ["KeyS", "ArrowDown"],
  run: ["ShiftLeft", "ShiftRight", "KeyX", "KeyB"],
};

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getY: () => number;
      getBottom: () => number;
      getGrounded: () => boolean;
      getYaw: () => number;
      getSpeed: () => number;
      getVy: () => number;
      getPerch: () => number;
      warp: (perch: number) => void;
      setKeys: (codes: string[]) => void;
      getPhase: () => Phase;
    };
  }
}

export async function startAtrium(
  canvas: HTMLCanvasElement,
  onPhase: (phase: Phase) => void,
  onPerch?: (perch: number) => void,
): Promise<Engine> {
  // Everything is drawn in code; give the first bake a frame to land in.
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const scene = new Scene();
  const olive = new Olive();
  const fx = new Fx();
  const sound = new Sound();
  const real = new Set<string>();
  const injected = new Set<string>();
  let phase: Phase = "title";
  let player: Player = makePlayer();
  let prev = { x: player.x, y: player.y, camX: 0, camY: 0 };
  let camX = 0;
  let camY = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let time = 0;
  let shake = 0;
  let highest = 1;
  // At the end Olive trots to the dish, faces it and eats.
  let atDish = false;
  let celebrated = false;
  let lastChew = 0;
  // Dynamic resolution: if frames run long, render fewer pixels and let the
  // browser scale the canvas up. It only ever steps down, so it can't hunt.
  let quality = 1;
  let slow = 0;
  let judged = 0;

  const held = (code: string) => real.has(code) || injected.has(code);
  const any = (codes: string[]) => codes.some(held);

  function setPhase(next: Phase) {
    phase = next;
    onPhase(next);
  }

  function viewSize() {
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight);
    const viewW = Math.min(WORLD_W, Math.max(800, cssW * 0.8));
    const viewH = cssH * (viewW / cssW);
    return { viewW, viewH, cssW, cssH };
  }

  function reset() {
    player = makePlayer();
    olive.reset();
    fx.clear();
    shake = 0;
    highest = 1;
    atDish = false;
    celebrated = false;
    lastChew = 0;
    onPerch?.(1);
    setPhase("play");
  }

  function begin() {
    sound.unlock();
    if (phase === "title") setPhase("play");
  }

  function readInput(): Input {
    if (phase !== "play") return NO_INPUT;
    return {
      left: any(KEYS.left),
      right: any(KEYS.right),
      jump: any(KEYS.jump),
      down: any(KEYS.down),
      run: any(KEYS.run),
    };
  }

  function onLanded(p: Platform, impact: number) {
    const cx = player.x + player.w / 2;
    olive.landed(impact);
    scene.press(p, impact);
    sound.land(impact);
    if (impact > 5) {
      shake = Math.min(5, impact / 3);
      fx.dust(
        cx,
        p.y,
        Math.round(3 + impact * 0.5),
        30,
        0,
        p.kind === "floor" ? "#e8dcc6" : "#f3e6d2",
      );
      if (impact > 10) fx.ring(cx, p.y, 18);
    }
    if (p.kind === "perch" && p.index + 1 > highest) {
      highest = p.index + 1;
      onPerch?.(highest);
    }
  }

  /** After the win: walk to the dish and turn to face it. */
  function approachDish() {
    const cx = player.x + player.w / 2;
    const side = cx < GOAL.x ? -1 : 1;
    const target = GOAL.x + side * MOUTH;
    const dx = target - cx;
    if (!atDish && Math.abs(dx) > 2) {
      player.vx = Math.sign(dx) * Math.min(3.2, Math.abs(dx));
      player.x += player.vx;
      player.facing = dx > 0 ? 1 : -1;
    } else {
      player.vx = 0;
      player.facing = side > 0 ? -1 : 1;
      atDish = true;
    }
  }

  function step(dt: number) {
    time += dt;
    const input = readInput();
    if (phase === "play") {
      const groundBefore = player.ground;
      const ev = stepPlayer(player, input, dt);
      const cx = player.x + player.w / 2;
      const feet = player.y + player.h;
      if (ev.jumped) {
        olive.jumped();
        const speed = Math.abs(player.vx);
        fx.dust(cx - player.facing * 6, feet, 3 + Math.round(speed * 0.6), 22, -player.facing);
        sound.jump(speed);
        if (groundBefore) scene.press(groundBefore, 2.5);
      }
      if (ev.dropped) {
        olive.dropped();
        sound.drop();
      }
      if (ev.landed && ev.landedOn) onLanded(ev.landedOn, ev.landed);
      if (
        player.grounded &&
        player.turning &&
        Math.abs(player.vx) > 3 &&
        player.groundFrames % 4 === 0
      ) {
        fx.dust(cx + player.facing * 14, feet, 1, 14, player.facing);
        if (player.groundFrames % 8 === 0) sound.skid();
      }
      if (
        player.grounded &&
        Math.abs(player.vx) > TUNING.walk + 1 &&
        player.groundFrames % 9 === 0
      ) {
        fx.dust(cx - player.facing * 20, feet, 1, 10, -player.facing);
      }

      // The original finish: on the crown perch, close enough to the salmon.
      const sx = SUMMIT.x + SUMMIT.w * 0.62;
      const sy = SUMMIT.y - 54;
      const onSummit =
        player.grounded &&
        player.x + player.w > SUMMIT.x + 4 &&
        player.x < SUMMIT.x + SUMMIT.w - 4 &&
        Math.abs(player.y + player.h - SUMMIT.y) < 8;
      const dx = sx - cx;
      const dy = sy - (player.y + player.h * 0.35);
      if (onSummit && dx * dx + dy * dy < 72 * 72) {
        setPhase("won");
        fx.sparkles(GOAL.x, GOAL.y - 20, 18, 30);
        sound.win();
      }
    } else {
      holdPlayer(player, input);
      if (phase === "won") approachDish();
    }

    if (phase === "won" && atDish) {
      const chew = olive.eaten;
      if (chew > lastChew + 0.18) {
        lastChew = chew;
        sound.nom();
        fx.crumbs(GOAL.x, GOAL.y - 8, 3);
      }
      if (olive.finishedEating && !celebrated) {
        celebrated = true;
        fx.hearts(player.x + player.w / 2 + player.facing * 12, player.y - 30, 5);
        sound.purr();
      }
      if (celebrated && Math.random() < dt * 1.1) {
        fx.hearts(player.x + player.w / 2 + player.facing * 14, player.y - 40, 1);
      }
    }

    fx.update(dt);
    scene.update(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 16);

    // The original camera: lead in the facing direction, ease toward Olive.
    const focusX = player.x + player.w / 2 + player.facing * 170;
    const focusY = player.y - 30;
    const { viewW, viewH } = viewSize();
    const destX = Math.max(0, Math.min(WORLD_W - viewW, focusX - viewW * 0.4));
    const destY = Math.max(0, Math.min(WORLD_H - viewH, focusY - viewH * 0.58));
    const k = 1 - Math.exp(-dt * 6.5);
    camX += (destX - camX) * k;
    camY += (destY - camY) * k;
  }

  function draw(alpha: number, frameDt: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    const { viewW, viewH, cssW, cssH } = viewSize();
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const k = bw / viewW;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    const camLX = Math.max(0, Math.min(WORLD_W - viewW, lerp(prev.camX, camX) + jx));
    const camLY = Math.max(0, Math.min(Math.max(0, WORLD_H - viewH), lerp(prev.camY, camY) + jy));
    const view: View = { camX: camLX, camY: camLY, viewW, viewH, k };
    scene.prepare(view);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.setTransform(k, 0, 0, k, 0, 0);
    scene.drawBackdrop(ctx, view, time);

    ctx.setTransform(k, 0, 0, k, -camLX * k, -camLY * k);
    scene.drawWorld(ctx, view, time);

    const px = lerp(prev.x, player.x);
    const py = lerp(prev.y, player.y);
    const cx = px + player.w / 2;
    const feet = py + player.h + (player.grounded ? scene.dipOf(player.ground) * 0.3 : 0);

    const playing = phase === "play";
    olive.update(frameDt, {
      vx: player.vx,
      vy: player.vy,
      grounded: player.grounded,
      turning: player.turning,
      facing: player.facing,
      worldX: cx,
      scale: OLIVE_SCALE,
      rest: phase === "title",
      eat: phase === "won" && atDish,
      busy: playing && (any(KEYS.left) || any(KEYS.right) || any(KEYS.jump) || any(KEYS.down)),
      look:
        player.ground === SUMMIT || phase === "won"
          ? { x: (GOAL.x - cx) * player.facing, y: GOAL.y - feet }
          : null,
    });
    olive.prepare(ctx, cx, feet, OLIVE_SCALE);
    const floorGap = FLOOR_Y - feet;
    if (floorGap < 160) olive.reflect(ctx, FLOOR_Y, 0.22 * (1 - floorGap / 160));

    scene.drawCushions(ctx, view);
    drawShadow(ctx, cx, feet);
    scene.drawGoal(ctx, time, olive.eaten);
    fx.drawBack(ctx);
    olive.composite(ctx);
    fx.drawFront(ctx);

    ctx.setTransform(k, 0, 0, k, 0, 0);
    scene.drawFront(ctx, view, time);
  }

  /** A soft shadow under Olive on whatever is below her. */
  function drawShadow(ctx: CanvasRenderingContext2D, cx: number, feet: number) {
    let below: Platform | null = null;
    for (const p of PLATFORMS) {
      if (p.y < feet - 1) continue;
      if (cx + 16 < p.x || cx - 16 > p.x + p.w) continue;
      if (!below || p.y < below.y) below = p;
    }
    if (!below) return;
    const h = below.y - feet;
    const fade = Math.max(0, 1 - h / 520);
    if (fade <= 0) return;
    const y = below.y + scene.dipOf(below) * 0.3 + (below.kind === "floor" ? 2 : -1);
    const rx = 32 * (0.55 + 0.45 * fade);
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, rx);
    g.addColorStop(0, `rgba(12, 8, 14, ${0.42 * fade})`);
    g.addColorStop(1, "rgba(12, 8, 14, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, y, rx, rx * 0.22, 0, 0, TAU);
    ctx.fill();
  }

  function frameLoop(now: number) {
    const raw = (now - last) / 1000;
    // The original pacing: at most 50 ms of game time and five steps a frame.
    const delta = Math.min(0.05, raw);
    last = now;
    if (raw < 0.25) {
      judged += raw;
      if (raw > 1 / 45) slow += raw;
      if (judged > 2) {
        if (slow / judged > 0.5 && quality > 0.55) quality = Math.max(0.55, quality - 0.15);
        judged = 0;
        slow = 0;
      }
    }
    acc += delta;
    let guard = 0;
    while (acc >= STEP && guard < 5) {
      prev = { x: player.x, y: player.y, camX, camY };
      step(STEP);
      acc -= STEP;
      guard++;
    }
    // A respawn or reset should not smear across the screen.
    if (Math.abs(prev.y - player.y) > 200 || Math.abs(prev.x - player.x) > 200) {
      prev = { x: player.x, y: player.y, camX, camY };
    }
    draw(Math.min(1, acc / STEP), delta);
    window.__controlsTest = probe;
    raf = requestAnimationFrame(frameLoop);
  }

  const gameKeys = new Set(Object.values(KEYS).flat());
  const onKeyDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
    real.add(e.code);
    if (phase === "title" && !e.repeat && gameKeys.has(e.code)) begin();
    else sound.unlock();
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

  function placeCamera() {
    const { viewW, viewH } = viewSize();
    camX = Math.max(0, Math.min(WORLD_W - viewW, player.x - viewW * 0.28));
    camY = Math.max(0, Math.min(WORLD_H - viewH, player.y - viewH * 0.62));
    prev = { x: player.x, y: player.y, camX, camY };
  }

  const probe = {
    getX: () => player.x,
    getY: () => player.y,
    getBottom: () => player.y + player.h,
    getGrounded: () => player.grounded,
    getYaw: () => player.facing,
    getSpeed: () => Math.abs(player.vx),
    getVy: () => player.vy,
    getPerch: () => (player.ground?.kind === "perch" ? player.ground.index + 1 : 0),
    setKeys: (codes: string[]) => {
      injected.clear();
      for (const c of codes) injected.add(c);
      if (phase === "title" && codes.length) begin();
    },
    getPhase: () => phase,
    /** Test hook: stand Olive on a perch (1-based), or the floor with 0. */
    warp: (perch: number) => {
      const p = perch > 0 ? PLATFORMS[perch] : PLATFORMS[0];
      if (!p) return;
      player = makePlayer();
      player.x = p.x + (p.kind === "floor" ? 300 : 20);
      player.y = p.y - player.h;
      player.ground = p;
      player.onSolid = p.solid;
      placeCamera();
    },
  };
  window.__controlsTest = probe;

  placeCamera();
  onPhase("title");
  raf = requestAnimationFrame(frameLoop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      sound.close();
      if (window.__controlsTest === probe) delete window.__controlsTest;
    },
    setKey(code: string, down: boolean) {
      if (down) {
        real.add(code);
        if (phase === "title") begin();
        else sound.unlock();
      } else real.delete(code);
    },
    start: begin,
    reset,
  };
}
