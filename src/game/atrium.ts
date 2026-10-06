import { Sound } from "./audio.ts";
import { Fx } from "./fx.ts";
import { FLOOR_Y, GOAL, PLATFORMS, SUMMIT, WORLD_H, WORLD_W, type Platform } from "./level.ts";
import { Olive } from "./olive.ts";
import { makePlayer, stepPlayer, TUNING, type Input, type Player } from "./physics.ts";
import { cameraYFor, Scene, type View } from "./scene.ts";

export type Phase = "title" | "play" | "won";

export type Engine = {
  destroy: () => void;
  setKey: (code: string, down: boolean) => void;
  start: () => void;
  reset: () => void;
};

const STEP = 1 / 60;
/** Olive is drawn a little larger than her hitbox suggests, to show her off. */
const OLIVE_SCALE = 1.2;
const TAU = Math.PI * 2;

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
      getGliding: () => boolean;
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
  // Fonts aside, everything is drawn in code; give the first bake a frame.
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
  let anchorY = player.y + player.h;
  let lookX = 120;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let time = 0;
  let shake = 0;
  let eaten = 0;
  let wonAt = 0;
  let highest = 0;
  let streakT = 0;
  let glideShow = 0;
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

  function clampCam(x: number, y: number, viewW: number, viewH: number) {
    return {
      x: Math.max(0, Math.min(WORLD_W - viewW, x)),
      y: Math.max(0, Math.min(Math.max(0, WORLD_H - viewH), y)),
    };
  }

  function reset() {
    player = makePlayer();
    fx.clear();
    shake = 0;
    eaten = 0;
    highest = 0;
    anchorY = player.y + player.h;
    onPerch?.(1);
    setPhase("play");
  }

  function begin() {
    sound.unlock();
    if (phase === "title") setPhase("play");
  }

  function readInput(): Input {
    const playing = phase === "play";
    return {
      left: playing && any(KEYS.left),
      right: playing && any(KEYS.right),
      jump: playing && any(KEYS.jump),
      down: playing && any(KEYS.down),
      run: playing && any(KEYS.run),
    };
  }

  function onLanded(p: Platform, impact: number) {
    const cx = player.x + player.w / 2;
    olive.landed(impact);
    scene.press(p, impact);
    if (impact > 4) {
      fx.dust(
        cx,
        p.y,
        Math.round(3 + impact * 0.6),
        30,
        0,
        p.kind === "floor" ? "#e8dcc6" : "#f3e6d2",
      );
      if (impact > 9) {
        fx.ring(cx, p.y, 18);
        fx.fibres(cx, p.y, 3, p.side === "left" ? "#46a274" : "#c94d63");
      }
      if (player.diving || impact > 13) shake = Math.min(6, impact * 0.35);
    }
    sound.land(impact);
    if (p.kind === "perch" && p.index + 1 > highest) {
      highest = p.index + 1;
      onPerch?.(highest);
    }
  }

  function step(dt: number) {
    time += dt;
    const input = readInput();
    const groundBefore = player.ground;
    const ev = stepPlayer(player, input);
    const cx = player.x + player.w / 2;
    const feet = player.y + player.h;

    if (ev.jumped) {
      olive.jumped();
      const speed = Math.abs(player.vx);
      fx.dust(cx - player.facing * 6, feet, 4 + Math.round(speed), 22, -player.facing);
      sound.jump(speed);
      if (groundBefore) scene.press(groundBefore, 2.5);
    }
    if (ev.landed && ev.landedOn) onLanded(ev.landedOn, ev.landed);
    if (ev.skid) {
      if (Math.random() < 0.5) fx.dust(cx + player.facing * 12, feet, 1, 14, player.facing);
      if (player.groundFrames % 8 === 0) sound.skid();
    }
    if (ev.dropped) sound.drop();
    if (ev.glideStart) fx.sparkles(cx, player.y, 3, 20);
    if (ev.tired) fx.dust(cx, player.y + 10, 4, 20);
    if (player.grounded && Math.abs(player.vx) > TUNING.walk + 1 && player.groundFrames % 9 === 0) {
      fx.dust(cx - player.facing * 18, feet, 1, 10, -player.facing);
    }
    if (player.gliding) {
      streakT -= dt;
      if (streakT <= 0) {
        streakT = 0.035;
        fx.streak(
          cx + (Math.random() - 0.5) * 60,
          player.y - 10 + (Math.random() - 0.5) * 50,
          player.vx,
          player.vy,
        );
      }
    }

    // Win: settle on the crown perch close to the salmon.
    if (phase === "play" && player.grounded && player.ground === SUMMIT) {
      if (Math.abs(cx - GOAL.x) < 64) {
        setPhase("won");
        wonAt = time;
        olive.celebrate();
        fx.sparkles(GOAL.x, GOAL.y - 20, 26, 30);
        fx.hearts(cx, player.y - 30, 5);
        sound.win();
      }
    }
    if (phase === "won") {
      eaten = Math.min(1, eaten + dt * 1.8);
      if (time - wonAt > 0.6 && Math.random() < dt * 1.2)
        fx.hearts(cx + player.facing * 14, player.y - 40, 1);
    }

    fx.update(dt);
    scene.update(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 20);
    glideShow += ((player.stamina < TUNING.glideStamina ? 1 : 0) - glideShow) * Math.min(1, dt * 8);

    // Camera: lead the run, and only follow jumps once they leave the band.
    const { viewW, viewH } = viewSize();
    const wantLook = player.facing * 110 + player.vx * 9;
    lookX += (wantLook - lookX) * (1 - Math.exp(-dt * 2.5));
    if (player.grounded) anchorY = feet;
    else if (feet > anchorY) anchorY = feet;
    else if (feet < anchorY - 150) anchorY = feet + 150;
    const target = clampCam(cx + lookX - viewW * 0.5, cameraYFor(anchorY, viewH), viewW, viewH);
    const falling = !player.grounded && player.vy > 6;
    camX += (target.x - camX) * (1 - Math.exp(-dt * 4.5));
    camY += (target.y - camY) * (1 - Math.exp(-dt * (falling ? 9 : 4.2)));
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
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    const cam = clampCam(lerp(prev.camX, camX) + sx, lerp(prev.camY, camY) + sy, viewW, viewH);
    const view: View = { camX: cam.x, camY: cam.y, viewW, viewH, k };
    scene.prepare(view);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.setTransform(k, 0, 0, k, 0, 0);
    scene.drawBackdrop(ctx, view, time);

    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    scene.drawWorld(ctx, view, time);

    const px = lerp(prev.x, player.x);
    const py = lerp(prev.y, player.y);
    const cx = px + player.w / 2;
    const feet = py + player.h + (player.grounded ? scene.dipOf(player.ground) * 0.3 : 0);

    olive.update(frameDt, {
      vx: player.vx,
      vy: player.vy,
      grounded: player.grounded,
      gliding: player.gliding,
      diving: player.diving,
      skidding: player.skidding,
      stamina: player.stamina / TUNING.glideStamina,
      rest: phase !== "play",
      busy: phase === "play" && (any(KEYS.left) || any(KEYS.right) || any(KEYS.jump)),
      look:
        player.ground === SUMMIT || phase === "won"
          ? { x: (GOAL.x - cx) * player.facing, y: GOAL.y - feet }
          : null,
    });
    olive.prepare(ctx, cx, feet, player.facing, OLIVE_SCALE);
    const floorGap = FLOOR_Y - feet;
    if (floorGap < 160) olive.reflect(ctx, FLOOR_Y, 0.22 * (1 - floorGap / 160));
    scene.drawCushions(ctx, view);
    drawShadow(ctx, cx, feet);
    scene.drawGoal(ctx, time, eaten);
    fx.drawBack(ctx);
    olive.composite(ctx);
    fx.drawFront(ctx);
    drawGlideMeter(ctx, cx, py);

    ctx.setTransform(k, 0, 0, k, 0, 0);
    scene.drawFront(ctx, view, time, player.gliding ? 1 : 0);
    sound.setWind(player.gliding ? Math.min(1, 0.4 + Math.abs(player.vx) / 10) : 0);
  }

  /** A soft shadow on whatever Olive would land on, to judge the drop. */
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
    const rx = 30 * (0.55 + 0.45 * fade);
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, rx);
    g.addColorStop(0, `rgba(12, 8, 14, ${0.42 * fade})`);
    g.addColorStop(1, "rgba(12, 8, 14, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, y, rx, rx * 0.22, 0, 0, TAU);
    ctx.fill();
  }

  /** A small ring over Olive's back that drains while she glides. */
  function drawGlideMeter(ctx: CanvasRenderingContext2D, cx: number, top: number) {
    if (glideShow < 0.02) return;
    const left = player.stamina / TUNING.glideStamina;
    const x = cx - player.facing * 16;
    const y = top - 46;
    ctx.save();
    ctx.globalAlpha = glideShow;
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(20, 14, 10, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = left > 0.3 ? "#fff1cf" : "#ff8a7a";
    ctx.beginPath();
    ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.restore();
  }

  function frameLoop(now: number) {
    const raw = (now - last) / 1000;
    const delta = Math.min(0.1, raw);
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
    while (acc >= STEP && guard < 6) {
      prev = { x: player.x, y: player.y, camX, camY };
      step(STEP);
      acc -= STEP;
      guard++;
    }
    if (guard >= 6) acc = 0;
    // A respawn or reset should not smear across the screen.
    if (Math.abs(prev.y - player.y) > 200 || Math.abs(prev.x - player.x) > 200) {
      prev = { x: player.x, y: player.y, camX, camY };
    }
    draw(acc / STEP, delta);
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

  const probe = {
    getX: () => player.x,
    getY: () => player.y,
    getBottom: () => player.y + player.h,
    getGrounded: () => player.grounded,
    getYaw: () => player.facing,
    getSpeed: () => Math.abs(player.vx),
    getVy: () => player.vy,
    getGliding: () => player.gliding,
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
      anchorY = p.y;
      const { viewW, viewH } = viewSize();
      const c = clampCam(player.x + lookX - viewW * 0.5, cameraYFor(anchorY, viewH), viewW, viewH);
      camX = c.x;
      camY = c.y;
      prev = { x: player.x, y: player.y, camX, camY };
    },
  };
  window.__controlsTest = probe;

  const { viewW, viewH } = viewSize();
  const start = clampCam(player.x + lookX - viewW * 0.5, cameraYFor(anchorY, viewH), viewW, viewH);
  camX = start.x;
  camY = start.y;
  prev = { x: player.x, y: player.y, camX, camY };
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
