import { FIRST, FLOOR_Y, LEFT_X, PLATFORMS, WORLD_H, WORLD_W, type Platform } from "./level.ts";

/**
 * Olive's movement: the original run-and-jump, unchanged. Speeds are in
 * pixels per 60 Hz step. Run is 20% faster than the Mario pass. The jump
 * falls sooner, and the air window opens on the way down so the landing
 * can be steered.
 *
 * The step is pure so the engine and the tests share it. Besides moving
 * Olive it reports what happened, which drives her animation.
 */
export const TUNING = {
  walk: 5.04,
  run: 8.4,
  accel: 0.26,
  friction: 0.75,
  pivot: 0.48,
  jumpV: -14.4,
  gravRise: 0.52,
  gravHang: 0.58,
  gravFall: 1.5,
  apex: 2.8,
  maxFall: 14.5,
  brake: 2.4,
  extra: 1.15,
  fallDrift: 3.8,
  riseSteer: 0.3,
  fallSteer: 0.52,
  coyote: 5,
} as const;

export const PW = 42;
export const PH = 34;
export const START_X = LEFT_X + 6;
export const START_Y = FLOOR_Y - FIRST - PH;

export type Input = {
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
  run: boolean;
};

export const NO_INPUT: Input = { left: false, right: false, jump: false, down: false, run: false };

export type Player = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  onSolid: boolean;
  /** Seconds left of ignoring cushions after dropping through one. */
  drop: number;
  coyote: number;
  airLo: number;
  airHi: number;
  launchVx: number;
  wasJump: boolean;
  wasDown: boolean;
  /** For the animation only: what Olive stands on, and for how long. */
  ground: Platform | null;
  groundFrames: number;
  airFrames: number;
  /** Reversing on the ground (the pivot), for the animation. */
  turning: boolean;
};

export type StepEvents = {
  jumped: boolean;
  /** Fall speed at touchdown, 0 unless Olive came down from the air this step. */
  landed: number;
  landedOn: Platform | null;
  dropped: boolean;
  respawned: boolean;
};

export function makePlayer(): Player {
  return {
    x: START_X,
    y: START_Y,
    w: PW,
    h: PH,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    onSolid: true,
    drop: 0,
    coyote: TUNING.coyote,
    airLo: -4,
    airHi: 4,
    launchVx: 0,
    wasJump: false,
    wasDown: false,
    ground: PLATFORMS[1] ?? null,
    groundFrames: 0,
    airFrames: 0,
    turning: false,
  };
}

export function approach(value: number, target: number, accel: number) {
  if (value < target) return Math.min(target, value + accel);
  if (value > target) return Math.max(target, value - accel);
  return value;
}

/** Advance Olive one step. Mutates `p` and reports what happened. */
export function stepPlayer(
  p: Player,
  input: Input,
  dt = 1 / 60,
  platforms: readonly Platform[] = PLATFORMS,
): StepEvents {
  const T = TUNING;
  const ev: StepEvents = {
    jumped: false,
    landed: 0,
    landedOn: null,
    dropped: false,
    respawned: false,
  };
  const { left, right, run } = input;
  const jumpNow = input.jump;
  const downNow = input.down;
  const wasGrounded = p.grounded;

  let target = 0;
  if (right) target = run ? T.run : T.walk;
  else if (left) target = run ? -T.run : -T.walk;
  if (target !== 0) p.facing = target > 0 ? 1 : -1;

  p.turning = false;
  if (p.grounded) {
    if (target !== 0) {
      const turning = Math.sign(target) !== Math.sign(p.vx) && Math.abs(p.vx) > 0.2;
      p.turning = turning;
      p.vx = approach(p.vx, target, turning ? T.pivot : T.accel);
    } else {
      p.vx = approach(p.vx, 0, T.friction);
    }
    p.launchVx = p.vx;
    p.airLo = p.vx - (T.brake + 1);
    p.airHi = p.vx + (T.brake + 1);
  }

  const jumpEdge = jumpNow && !p.wasJump;
  const jumped = jumpEdge && p.drop <= 0 && (p.grounded || p.coyote > 0);
  if (jumped) {
    const spd = p.vx;
    p.vy = T.jumpV;
    p.grounded = false;
    p.coyote = 0;
    p.launchVx = spd;
    p.airLo = spd - (spd >= 0 ? T.brake : T.extra);
    p.airHi = spd + (spd >= 0 ? T.extra : T.brake);
    if (Math.abs(spd) < 2.2) {
      p.airLo = Math.min(p.airLo, -2.6);
      p.airHi = Math.max(p.airHi, 2.6);
    }
    ev.jumped = true;
  }

  if (!p.grounded) {
    const falling = p.vy > 0.4;
    const steer = falling ? T.fallSteer : T.riseSteer;
    if (left) p.vx -= steer;
    else if (right) p.vx += steer;
    if (falling) {
      p.airLo = Math.max(p.launchVx - T.fallDrift, p.airLo - 0.16);
      p.airHi = Math.min(p.launchVx + T.fallDrift, p.airHi + 0.16);
    }
    p.vx = Math.max(p.airLo, Math.min(p.airHi, p.vx));
  }

  p.x += p.vx;
  if (p.x < 8) {
    p.x = 8;
    p.vx = 0;
  }
  if (p.x + p.w > WORLD_W - 8) {
    p.x = WORLD_W - 8 - p.w;
    p.vx = 0;
  }

  if (p.grounded && p.drop <= 0) {
    let on: Platform | null = null;
    const bottom = p.y + p.h;
    for (const plat of platforms) {
      const overlap = p.x + p.w > plat.x + 2 && p.x < plat.x + plat.w - 2;
      if (overlap && Math.abs(bottom - plat.y) <= 3) {
        on = plat;
        p.onSolid = plat.solid;
        break;
      }
    }
    if (on) {
      p.ground = on;
    } else {
      p.grounded = false;
      p.onSolid = false;
      p.vy = 0;
      p.coyote = T.coyote;
    }
  }

  if (downNow && !p.wasDown && p.grounded && !p.onSolid) {
    p.drop = 0.16;
    p.y += 8;
    p.vy = 1;
    p.grounded = false;
    ev.dropped = true;
  }

  const prevBottom = p.y + p.h;
  if (!jumped && !p.grounded) {
    const grav =
      jumpNow && p.vy < -T.apex ? T.gravRise : jumpNow && p.vy < 0 ? T.gravHang : T.gravFall;
    p.vy = Math.min(T.maxFall, p.vy + grav);
    p.y += p.vy;
    p.coyote = Math.max(0, p.coyote - 1);
  } else if (p.grounded) {
    p.vy = 0;
    p.coyote = T.coyote;
  }

  let landed: Platform | null = null;
  if (p.drop > 0) p.drop -= dt;
  else if (!jumped && p.vy >= 0) {
    for (const plat of platforms) {
      const overlap = p.x + p.w > plat.x + 2 && p.x < plat.x + plat.w - 2;
      if (!overlap) continue;
      if (prevBottom <= plat.y + 5 && p.y + p.h >= plat.y && p.y + p.h <= plat.y + 28) {
        if (!landed || plat.y < landed.y) landed = plat;
      }
    }
  }

  if (landed) {
    const impact = p.vy;
    p.y = landed.y - p.h;
    p.vy = 0;
    if (!p.grounded) {
      ev.landed = Math.max(0.01, impact);
      ev.landedOn = landed;
    }
    p.grounded = true;
    p.onSolid = landed.solid;
    p.coyote = T.coyote;
    p.ground = landed;
  } else if (!p.grounded) {
    p.onSolid = false;
  }

  if (p.y > WORLD_H + 40) {
    p.x = START_X;
    p.y = START_Y;
    p.vx = 0;
    p.vy = 0;
    p.grounded = true;
    ev.respawned = true;
  }

  if (!p.grounded) p.ground = null;
  if (p.grounded) {
    p.groundFrames = wasGrounded ? p.groundFrames + 1 : 0;
    p.airFrames = 0;
  } else {
    p.airFrames = wasGrounded ? 0 : p.airFrames + 1;
    p.groundFrames = 0;
  }
  p.wasJump = jumpNow;
  p.wasDown = downNow;
  return ev;
}

/** Holding still: what the original did outside play (title card, win). */
export function holdPlayer(p: Player, input: Input) {
  p.vx = 0;
  p.vy = 0;
  p.grounded = true;
  p.wasJump = input.jump;
  p.wasDown = input.down;
}
