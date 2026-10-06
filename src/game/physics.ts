import { FIRST, FLOOR_Y, LEFT_X, PLATFORMS, WORLD_H, WORLD_W, type Platform } from "./level.ts";

/**
 * Olive's movement. Everything runs in pixels per 60 Hz frame so the numbers
 * read the same way the old tuning did. The step is pure: the engine, the
 * tests and the tuning sim all call `stepPlayer` with the same inputs.
 */
export const TUNING = {
  /** Top ground speed while walking and while holding Run. */
  walk: 4.6,
  run: 8.0,
  /** Ground speed-up up to walk speed, then the slower build to run speed. */
  groundAccel: 0.62,
  runAccel: 0.36,
  /** Letting go stops Olive in about 8 frames from a full run. */
  groundStop: 1.05,
  /** Reversing on the ground skids at this rate. */
  skid: 1.35,
  /** Air steering: toward the held direction, against momentum, and coasting. */
  airAccel: 0.46,
  airTurn: 0.68,
  airDrag: 0.02,
  /** Take-off speed. Running adds a little height, like a real bound. */
  jumpV: 14.1,
  jumpSpeedBonus: 0.12,
  /** Gravity while Jump is held on the way up, after a release, and falling. */
  gravRise: 0.6,
  gravCut: 1.1,
  gravFall: 0.82,
  /** Letting go early halves the remaining rise once, for short hops. */
  cutFactor: 0.5,
  /** Near the apex with Jump held, gravity softens so the landing can be set. */
  apexBand: 1.8,
  gravApex: 0.27,
  maxFall: 12.5,
  /** Down in the air dives. */
  fastFallGrav: 1.4,
  fastFallMax: 16.5,
  /** Hold Jump on the way down to glide. */
  glideFall: 1.5,
  glideSink: 1.6,
  glideBrake: 0.8,
  glideDelay: 6,
  glideStamina: 66,
  glideAccel: 0.3,
  /** Gliding carries Olive forward at least this fast while a direction is held. */
  glideCruise: 5.8,
  /** Late-jump and early-jump forgiveness, in frames. */
  coyote: 7,
  buffer: 8,
  /** Landing counts with this much of the hitbox past a cushion's end. */
  ledgeGrace: 5,
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
  ground: Platform | null;
  coyote: number;
  buffer: number;
  drop: number;
  /** Still in the held part of a jump, before a release or the apex. */
  rising: boolean;
  /** Fastest the air steering will push Olive: her take-off speed or a walk. */
  airTop: number;
  gliding: boolean;
  glideHold: number;
  stamina: number;
  diving: boolean;
  skidding: boolean;
  airFrames: number;
  groundFrames: number;
  jumpWas: boolean;
  downWas: boolean;
};

export type StepEvents = {
  jumped: boolean;
  /** Fall speed at touchdown, 0 when Olive did not land this frame. */
  landed: number;
  landedOn: Platform | null;
  glideStart: boolean;
  glideEnd: boolean;
  /** The glide ran out rather than being let go. */
  tired: boolean;
  skid: boolean;
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
    onSolid: false,
    ground: PLATFORMS[1] ?? null,
    coyote: TUNING.coyote,
    buffer: 0,
    drop: 0,
    rising: false,
    airTop: TUNING.walk,
    gliding: false,
    glideHold: 0,
    stamina: TUNING.glideStamina,
    diving: false,
    skidding: false,
    airFrames: 0,
    groundFrames: 0,
    jumpWas: false,
    downWas: false,
  };
}

export function approach(value: number, target: number, step: number) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

function overlaps(p: Player, plat: Platform, grace: number) {
  return p.x + p.w > plat.x - grace && p.x < plat.x + plat.w + grace;
}

function emptyEvents(): StepEvents {
  return {
    jumped: false,
    landed: 0,
    landedOn: null,
    glideStart: false,
    glideEnd: false,
    tired: false,
    skid: false,
    dropped: false,
    respawned: false,
  };
}

/** Advance Olive one 60 Hz frame. Mutates `p` and reports what happened. */
export function stepPlayer(
  p: Player,
  input: Input,
  platforms: readonly Platform[] = PLATFORMS,
): StepEvents {
  const T = TUNING;
  const ev = emptyEvents();
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const jumpEdge = input.jump && !p.jumpWas;
  const downEdge = input.down && !p.downWas;
  if (jumpEdge) p.buffer = T.buffer;
  if (dir !== 0) p.facing = dir > 0 ? 1 : -1;

  // Horizontal speed.
  p.skidding = false;
  if (p.grounded) {
    const top = input.run ? T.run : T.walk;
    if (dir === 0) {
      p.vx = approach(p.vx, 0, T.groundStop);
    } else {
      const target = dir * top;
      const reversing = Math.sign(p.vx) === -dir && Math.abs(p.vx) > 0.5;
      if (reversing) {
        if (Math.abs(p.vx) > 3) {
          p.skidding = true;
          ev.skid = true;
        }
        p.vx = approach(p.vx, target, T.skid);
      } else if (Math.abs(p.vx) > top) {
        // Run was let go: ease back to a walk instead of snapping.
        p.vx = approach(p.vx, target, T.groundStop * 0.45);
      } else {
        p.vx = approach(p.vx, target, Math.abs(p.vx) < T.walk ? T.groundAccel : T.runAccel);
      }
    }
  } else {
    const top = p.gliding ? Math.max(p.airTop, T.glideCruise) : p.airTop;
    if (dir === 0) {
      p.vx = approach(p.vx, 0, T.airDrag);
    } else if (Math.sign(p.vx) === -dir) {
      p.vx = approach(p.vx, dir * top, p.gliding ? T.glideAccel * 1.5 : T.airTurn);
    } else if (Math.abs(p.vx) < top) {
      p.vx = approach(p.vx, dir * top, p.gliding ? T.glideAccel : T.airAccel);
    }
  }

  // Take-off: buffered presses and late presses off a ledge both count.
  let jumped = false;
  if (p.buffer > 0 && (p.grounded || p.coyote > 0) && p.drop <= 0) {
    const speed = Math.abs(p.vx);
    p.vy = -(T.jumpV + T.jumpSpeedBonus * speed);
    p.grounded = false;
    p.ground = null;
    p.coyote = 0;
    p.buffer = 0;
    p.rising = true;
    p.airTop = Math.max(T.walk, speed);
    p.gliding = false;
    p.glideHold = 0;
    p.diving = false;
    p.airFrames = 0;
    jumped = true;
    ev.jumped = true;
  }

  // Short hop: a release on the way up cuts the rise once.
  if (p.rising && !input.jump && p.vy < 0) {
    p.vy *= T.cutFactor;
    p.rising = false;
  }
  if (p.rising && p.vy > T.apexBand) p.rising = false;

  p.x += p.vx;
  if (p.x < 8) {
    p.x = 8;
    p.vx = Math.max(0, p.vx);
  }
  if (p.x + p.w > WORLD_W - 8) {
    p.x = WORLD_W - 8 - p.w;
    p.vx = Math.min(0, p.vx);
  }

  // Walking off an edge starts the coyote window.
  if (p.grounded && p.drop <= 0) {
    const bottom = p.y + p.h;
    let support: Platform | null = null;
    for (const plat of platforms) {
      if (overlaps(p, plat, T.ledgeGrace) && Math.abs(bottom - plat.y) <= 3) {
        support = plat;
        break;
      }
    }
    if (support) {
      p.ground = support;
      p.onSolid = support.solid;
    } else {
      p.grounded = false;
      p.ground = null;
      p.onSolid = false;
      p.vy = 0;
      p.coyote = T.coyote;
      p.rising = false;
      p.airTop = Math.max(T.walk, Math.abs(p.vx));
      p.airFrames = 0;
    }
  }

  if (downEdge && p.grounded && !p.onSolid) {
    p.drop = 10;
    p.y += 6;
    p.vy = 1.5;
    p.grounded = false;
    p.ground = null;
    p.coyote = 0;
    p.rising = false;
    p.airTop = Math.max(T.walk, Math.abs(p.vx));
    p.airFrames = 0;
    ev.dropped = true;
  }

  const prevBottom = p.y + p.h;
  if (!p.grounded && !jumped) {
    let grav: number;
    let cap: number = T.maxFall;
    if (p.vy < 0) {
      if (p.rising && input.jump) grav = -p.vy < T.apexBand ? T.gravApex : T.gravRise;
      else grav = T.gravCut;
    } else {
      grav = input.jump && p.vy < T.apexBand && p.airFrames > 4 ? T.gravApex : T.gravFall;
    }

    p.diving = input.down && p.vy > -1 && p.drop <= 0;
    if (p.diving) {
      grav = T.fastFallGrav;
      cap = T.fastFallMax;
    }

    // Glide: Jump held while falling, after a short deploy so a quick
    // buffered tap before a landing never turns into a float.
    if (input.jump && p.vy > 0 && p.stamina > 0 && !p.diving) p.glideHold += 1;
    else p.glideHold = 0;
    const wantGlide = p.glideHold >= T.glideDelay;
    if (wantGlide && !p.gliding) {
      p.gliding = true;
      ev.glideStart = true;
    } else if (!wantGlide && p.gliding) {
      p.gliding = false;
      ev.glideEnd = true;
    }

    if (p.gliding) {
      p.stamina -= 1;
      const spent = 1 - p.stamina / T.glideStamina;
      const sink = T.glideFall + spent * spent * T.glideSink;
      p.vy = p.vy > sink ? Math.max(sink, p.vy - T.glideBrake) : Math.min(sink, p.vy + grav * 0.5);
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.gliding = false;
        p.glideHold = 0;
        ev.glideEnd = true;
        ev.tired = true;
      }
    } else {
      p.vy = Math.min(cap, p.vy + grav);
    }
    p.y += p.vy;
    p.coyote = Math.max(0, p.coyote - 1);
  } else if (p.grounded) {
    p.vy = 0;
    p.coyote = T.coyote;
  }

  let landed: Platform | null = null;
  if (p.drop > 0) p.drop -= 1;
  else if (!jumped && !p.grounded && p.vy >= 0) {
    const bottom = p.y + p.h;
    for (const plat of platforms) {
      if (!overlaps(p, plat, T.ledgeGrace)) continue;
      if (prevBottom <= plat.y + 4 && bottom >= plat.y) {
        if (!landed || plat.y < landed.y) landed = plat;
      }
    }
  }

  if (landed) {
    ev.landed = Math.max(0.01, p.vy);
    ev.landedOn = landed;
    p.y = landed.y - p.h;
    p.vy = 0;
    p.grounded = true;
    p.ground = landed;
    p.onSolid = landed.solid;
    p.coyote = T.coyote;
    p.rising = false;
    p.diving = false;
    p.glideHold = 0;
    p.stamina = T.glideStamina;
    p.groundFrames = 0;
    if (p.gliding) {
      p.gliding = false;
      ev.glideEnd = true;
    }
  }

  if (p.y > WORLD_H + 40) {
    const fresh = makePlayer();
    fresh.facing = p.facing;
    Object.assign(p, fresh);
    ev.respawned = true;
  }

  if (p.grounded) {
    p.groundFrames += 1;
    p.airFrames = 0;
  } else {
    p.airFrames += 1;
    p.groundFrames = 0;
  }
  if (p.buffer > 0 && !jumpEdge) p.buffer -= 1;
  p.jumpWas = input.jump;
  p.downWas = input.down;
  return ev;
}
