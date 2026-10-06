/**
 * Olive, drawn live as a vector rig: a spline body, IK legs, a spring tail and
 * a three-quarter head. Every frame the pose is blended from what the physics
 * is doing, so a run turns into a gallop, a jump into a leap, a held fall into
 * a flying-squirrel glide, and a pause into a sit.
 *
 * The parts are painted into an offscreen canvas, then composited with one
 * clean silhouette outline, a soft halo and a rim of window light, so the cat
 * reads as a single illustrated shape instead of stacked pieces.
 *
 * Local space: origin on the ground under Olive's centre, +x is the way she
 * faces, +y is down. Units are world pixels.
 */

type V = { x: number; y: number };

const vec = (x: number, y: number): V => ({ x, y });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const len = (a: V) => Math.hypot(a.x, a.y);
const norm = (a: V): V => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: V, b: V, t: number): V => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const rot = (a: V, r: number): V => {
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a), 0, 1));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const TAU = Math.PI * 2;

/* Palette, sampled from the photos: a brown mackerel tabby with white. */
const C = {
  outline: "#271e19",
  inner: "rgba(39, 30, 25, 0.5)",
  tabby: "#8a7964",
  tabbyLight: "#b2a184",
  tabbyDark: "#62533f",
  warm: "rgba(170, 108, 58, 0.34)",
  stripe: "#33291f",
  white: "#faf7f2",
  whiteShade: "rgba(92, 84, 120, 0.2)",
  pinkIn: "#f2c9c4",
  pinkDeep: "#dc9a9a",
  nose: "#eda5ab",
  noseDark: "#b86c78",
  irisIn: "#e1df74",
  irisMid: "#adc04a",
  irisOut: "#5a7722",
  pupil: "#141a0e",
  navy: "#1f3070",
  navyDark: "#121c48",
  navyLight: "#3a50a8",
  navyEdge: "#0b1030",
  dot: "#f3f5ff",
  bell: "#e6e9ee",
  bellDark: "#8a93a0",
  rim: "#ffe3b0",
};

/** Leg order everywhere: far hind, near hind, far front, near front. */
const FAR_HIND = 0;
const NEAR_HIND = 1;
const FAR_FRONT = 2;
const NEAR_FRONT = 3;

const FRONT_UPPER = 13.5;
const FRONT_LOWER = 16;
const THIGH = 13.5;
const SHIN = 13.5;
const META = 10;
const PAW_R = 3.2;
const HALF_SPINE = 24;
const STAND_Y = -35;
const BODY_X = -7;

type Pose = {
  bx: number;
  by: number;
  pitch: number;
  arch: number;
  stretch: number;
  feet: [V, V, V, V];
  meta: [number, number];
  paw: [number, number, number, number];
  neck: number;
  headTilt: number;
  tailRaise: number;
  tailCurl: number;
  tailWave: number;
  ears: number;
};

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    bx: lerp(a.bx, b.bx, t),
    by: lerp(a.by, b.by, t),
    pitch: lerp(a.pitch, b.pitch, t),
    arch: lerp(a.arch, b.arch, t),
    stretch: lerp(a.stretch, b.stretch, t),
    feet: [
      lerpV(a.feet[0], b.feet[0], t),
      lerpV(a.feet[1], b.feet[1], t),
      lerpV(a.feet[2], b.feet[2], t),
      lerpV(a.feet[3], b.feet[3], t),
    ],
    meta: [lerp(a.meta[0], b.meta[0], t), lerp(a.meta[1], b.meta[1], t)],
    paw: [
      lerp(a.paw[0], b.paw[0], t),
      lerp(a.paw[1], b.paw[1], t),
      lerp(a.paw[2], b.paw[2], t),
      lerp(a.paw[3], b.paw[3], t),
    ],
    neck: lerp(a.neck, b.neck, t),
    headTilt: lerp(a.headTilt, b.headTilt, t),
    tailRaise: lerp(a.tailRaise, b.tailRaise, t),
    tailCurl: lerp(a.tailCurl, b.tailCurl, t),
    tailWave: lerp(a.tailWave, b.tailWave, t),
    ears: lerp(a.ears, b.ears, t),
  };
}

/** Skeleton points derived from a body placement. */
type Frame = { hip: V; shoulder: V; hipJoint: V; shoulderJoint: V; up: V; fwd: V };

function frameOf(bx: number, by: number, pitch: number, stretch: number): Frame {
  const fwd = rot(vec(1, 0), pitch);
  const up = rot(vec(0, -1), pitch);
  const c = vec(bx, by);
  const h = HALF_SPINE * stretch;
  const hip = add(c, mul(fwd, -h));
  const shoulder = add(c, mul(fwd, h));
  return {
    hip,
    shoulder,
    hipJoint: add(hip, add(mul(fwd, 4), mul(up, -5))),
    shoulderJoint: add(shoulder, add(mul(fwd, -1), mul(up, -7))),
    up,
    fwd,
  };
}

/** Two-bone IK. `bend` +1 puts the middle joint behind (elbow), -1 ahead (knee). */
function ik(root: V, target: V, l1: number, l2: number, bend: number): { mid: V; end: V } {
  const d = sub(target, root);
  const dist = clamp(len(d), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(d.y, d.x);
  const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  const mid = add(root, mul(rot(vec(1, 0), base + bend * a), l1));
  const end = add(root, mul(rot(vec(1, 0), base), dist));
  return { mid, end };
}

/* ------------------------------------------------------------------------ */
/* Poses                                                                     */
/* ------------------------------------------------------------------------ */

const WALK_OFFSETS = [0.5, 0, 0.75, 0.25];
const GALLOP_OFFSETS = [0.08, 0, 0.44, 0.54];
const STAND = frameOf(BODY_X, STAND_Y, 0, 1);
const HOME_HIND = STAND.hipJoint.x - 1;
const HOME_FRONT = STAND.shoulderJoint.x + 1;

function basePose(): Pose {
  return {
    bx: BODY_X,
    by: STAND_Y,
    pitch: 0,
    arch: 1.5,
    stretch: 1,
    feet: [
      vec(HOME_HIND + 4, -PAW_R),
      vec(HOME_HIND, -PAW_R),
      vec(HOME_FRONT - 4, -PAW_R),
      vec(HOME_FRONT, -PAW_R),
    ],
    meta: [0.3, 0.3],
    paw: [0, 0, 0, 0],
    neck: 0,
    headTilt: 0,
    tailRaise: 0.35,
    tailCurl: 1.6,
    tailWave: 0.25,
    ears: 0,
  };
}

function strideFor(speed: number, runK: number) {
  return lerp(lerp(6, 28, smoothstep(0, 4.6, speed)), 54, runK);
}

function stanceFor(runK: number) {
  return lerp(0.56, 0.34, runK);
}

/** Walk blends into a bounding gallop as speed climbs. Feet stay planted. */
function gaitPose(phase: number, speed: number, runK: number): Pose {
  const p = basePose();
  const moving = smoothstep(0.15, 1.2, speed);
  const stride = strideFor(speed, runK);
  const stance = stanceFor(runK);
  const lift = lerp(6, 10, runK) * moving;

  // Spine flex for the gallop: gathered near 0, stretched out near 0.45.
  const flex = Math.cos(TAU * (phase - 0.45));
  p.stretch = 1 + runK * 0.13 * flex;
  p.arch = lerp(1.5, 1.5 + 10 * Math.max(0, -flex) - 2 * Math.max(0, flex), runK);
  p.pitch =
    runK * -0.12 * Math.sin(TAU * phase) + moving * (1 - runK) * 0.012 * Math.sin(TAU * 2 * phase);
  p.by = STAND_Y - moving * lerp(0.7, 4, runK) * Math.cos(TAU * 2 * (phase - 0.45)) + runK * 1;
  p.bx = BODY_X + runK * 2;

  const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
  for (let i = 0; i < 4; i++) {
    const offset = lerp(WALK_OFFSETS[i]!, GALLOP_OFFSETS[i]!, runK);
    const s = (((phase + offset) % 1) + 1) % 1;
    const front = i >= 2;
    const home = front
      ? HOME_FRONT + (f.shoulderJoint.x - STAND.shoulderJoint.x)
      : HOME_HIND + (f.hipJoint.x - STAND.hipJoint.x);
    let x: number;
    let y: number;
    let paw = 0;
    if (s < stance) {
      const q = s / stance;
      x = home + stride * (0.5 - q);
      y = -PAW_R;
      paw = q > 0.75 ? (q - 0.75) * (front ? -1.2 : 1.6) : 0;
    } else {
      const q = (s - stance) / (1 - stance);
      x = home + stride * (-0.5 + smooth(q));
      y = -PAW_R - lift * Math.sin(Math.PI * q) * (front ? 1 : 0.9);
      // Gallop: hinds kick out behind, fronts reach long before touchdown.
      if (front) x += runK * 8 * Math.sin(Math.PI * q) * (q > 0.4 ? 1 : 0.3);
      else x -= runK * 7 * Math.sin(Math.PI * Math.min(1, q * 1.6));
      paw = front ? 1.1 * Math.sin(Math.PI * q) : -0.7 * Math.sin(Math.PI * q);
    }
    if (i === FAR_HIND || i === FAR_FRONT) x += 3 * (1 - runK);
    p.feet[i] = vec(x, y);
    p.paw[i] = paw * moving;
    if (!front) {
      const m =
        s < stance
          ? lerp(0.5, -0.2, s / stance)
          : lerp(-0.55, 0.5, smooth((s - stance) / (1 - stance)));
      p.meta[i === FAR_HIND ? 0 : 1] = lerp(0.3, m, moving);
    }
  }

  p.neck = -0.04 * moving - runK * 0.08;
  p.headTilt = -p.pitch * 0.85;
  p.tailRaise = lerp(lerp(0.35, 0.95, moving), 0.3 + 0.12 * flex, runK);
  p.tailCurl = lerp(lerp(1.6, 1.9, moving), 0.8, runK);
  p.tailWave = lerp(0.25, 0.45, moving);
  p.ears = runK * 0.3;
  return p;
}

function sitPose(): Pose {
  // Haunch folded under, hind paws flat beneath it, front legs straight,
  // chest up, tail laid along the floor around the feet.
  const p = basePose();
  p.bx = -3;
  p.by = -25.5;
  p.pitch = -0.85;
  p.stretch = 0.66;
  p.arch = 3;
  p.feet = [vec(6, -PAW_R), vec(3, -PAW_R), vec(13, -PAW_R), vec(16.5, -PAW_R)];
  p.meta = [Math.PI / 2, Math.PI / 2];
  p.paw = [0, 0, 0, 0];
  p.neck = 0.3;
  p.headTilt = 0.2;
  p.tailRaise = -0.4;
  p.tailCurl = -1.75;
  p.tailWave = 0.05;
  return p;
}

/** Leaping: from push-off, through the stretch and tuck, to reaching for the landing. */
function airPose(vy: number, vx: number): Pose {
  const p = basePose();
  const rise = smoothstep(-1, -9, vy);
  const fall = smoothstep(1, 8, vy);
  const apex = 1 - Math.max(rise, fall);
  p.pitch = -0.28 * rise + 0.16 * fall + clamp(Math.abs(vx) * 0.01, 0, 0.05) * apex;
  p.arch = -3 * rise + 5 * apex + 0.5 * fall;
  p.stretch = 1 + 0.08 * rise - 0.06 * apex + 0.03 * fall;
  p.by = STAND_Y - 2;
  const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
  const local = (root: V, off: V) => add(root, rot(off, p.pitch * 0.4));

  const pick = (r: V, a: V, fl: V) => add(add(mul(r, rise), mul(a, apex)), mul(fl, fall));
  const hind = pick(vec(-19, 15), vec(5, 15), vec(-1, 23));
  const front = pick(vec(12, 11), vec(7, 16), vec(11, 24));
  p.feet = [
    local(f.hipJoint, add(hind, vec(4, -1))),
    local(f.hipJoint, hind),
    local(f.shoulderJoint, add(front, vec(-4, -1))),
    local(f.shoulderJoint, front),
  ];
  p.meta = [lerp(0.4, -1.1, rise) + 0.6 * apex, lerp(0.4, -1.15, rise) + 0.6 * apex];
  p.paw = [-0.4 * rise, -0.5 * rise, 0.8 * apex + 0.4 * rise, 0.9 * apex + 0.5 * rise];
  p.neck = -0.1 * rise + 0.06 * fall;
  p.headTilt = -p.pitch * 0.6 + 0.12 * fall;
  p.tailRaise = -0.25 * rise + 0.5 * apex + 0.55 * fall;
  p.tailCurl = 0.3 * rise + 1.3 * apex + 0.9 * fall;
  p.tailWave = 0.15;
  p.ears = 0.25 * rise;
  return p;
}

/** Flying squirrel: legs spread wide, belly to the floor, tail streaming. */
function glidePose(t: number, tired: number): Pose {
  const p = basePose();
  p.pitch = 0.05;
  p.arch = -3.5;
  p.stretch = 1.1;
  p.by = STAND_Y - 2;
  const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
  const k = tired * 5;
  const w = t * 22;
  p.feet = [
    add(f.hipJoint, vec(-22 + Math.sin(w + 1) * k, 9 + Math.cos(w) * k)),
    add(f.hipJoint, vec(-25 + Math.sin(w) * k, 7 + Math.cos(w + 1) * k)),
    add(f.shoulderJoint, vec(21 + Math.sin(w + 2) * k, 9 + Math.cos(w + 3) * k)),
    add(f.shoulderJoint, vec(25 + Math.sin(w + 3) * k, 6 + Math.cos(w + 2) * k)),
  ];
  p.meta = [-1.35, -1.4];
  p.paw = [-0.9, -1, -0.3, -0.35];
  p.neck = -0.1;
  p.headTilt = -0.04;
  p.tailRaise = 0.1;
  p.tailCurl = -0.2;
  p.tailWave = 0.75;
  p.ears = 0.9;
  return p;
}

function divePose(): Pose {
  const p = basePose();
  p.pitch = 0.45;
  p.arch = 6;
  p.stretch = 0.92;
  p.by = STAND_Y - 2;
  const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
  p.feet = [
    add(f.hipJoint, vec(6, 13)),
    add(f.hipJoint, vec(3, 15)),
    add(f.shoulderJoint, vec(6, 15)),
    add(f.shoulderJoint, vec(10, 17)),
  ];
  p.meta = [0.9, 0.9];
  p.paw = [0.5, 0.5, 1, 1];
  p.neck = 0.1;
  p.headTilt = -0.25;
  p.tailRaise = 1.0;
  p.tailCurl = 0.5;
  p.tailWave = 0.2;
  p.ears = 1;
  return p;
}

/** Bracing against a reverse: leaning back with the front paws planted ahead. */
function skidPose(): Pose {
  const p = basePose();
  p.pitch = -0.1;
  p.by = STAND_Y + 4;
  p.bx = BODY_X - 3;
  p.feet = [
    vec(HOME_HIND + 2, -PAW_R),
    vec(HOME_HIND - 3, -PAW_R),
    vec(HOME_FRONT + 9, -PAW_R),
    vec(HOME_FRONT + 13, -PAW_R),
  ];
  p.meta = [0.7, 0.75];
  p.paw = [0, 0, -0.3, -0.35];
  p.tailRaise = 0.8;
  p.tailCurl = 0.6;
  p.ears = 0.5;
  return p;
}

/* ------------------------------------------------------------------------ */
/* Rig state                                                                 */
/* ------------------------------------------------------------------------ */

export type OliveDrive = {
  vx: number;
  vy: number;
  grounded: boolean;
  gliding: boolean;
  diving: boolean;
  skidding: boolean;
  /** 0..1 glide stamina left. */
  stamina: number;
  /** Ask Olive to sit (title card, the win). */
  rest: boolean;
  /** Something is happening; breaks a sit. */
  busy: boolean;
  /** Where to look, in local space, or null. */
  look: V | null;
};

type Leg = { pts: V[]; paw: V; pawAngle: number };

const TAIL_N = 11;
const TAIL_SEG = 4.9;
/** Offscreen bounds around the feet point, in local units. */
const BOUND_X = 104;
const BOUND_UP = 112;
const BOUND_DOWN = 26;

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

let furPattern: CanvasPattern | null | undefined;

/** A tile of short fur strokes, laid over the tabby for texture. */
function fur(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (furPattern !== undefined) return furPattern;
  const c = makeCanvas();
  c.width = c.height = 96;
  const g = c.getContext("2d");
  if (!g) return (furPattern = null);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.lineCap = "round";
  for (let i = 0; i < 520; i++) {
    const x = rnd() * 96;
    const y = rnd() * 96;
    const a = 1.35 + (rnd() - 0.5) * 0.7;
    const l = 3 + rnd() * 5;
    const light = rnd() < 0.5;
    g.strokeStyle = light ? "rgba(255, 246, 228, 0.55)" : "rgba(30, 22, 16, 0.55)";
    g.lineWidth = 0.7 + rnd() * 0.6;
    for (const ox of [-96, 0, 96]) {
      for (const oy of [-96, 0, 96]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        g.stroke();
      }
    }
  }
  furPattern = ctx.createPattern(c, "repeat");
  return furPattern;
}

export class Olive {
  private t = 0;
  private gait = 0;
  private speed = 0;
  private runK = 0;
  private air = 0;
  private glide = 0;
  private dive = 0;
  private skid = 0;
  private sit = 1;
  private idle = 0;
  private tired = 0;
  private vy = 0;
  private vx = 0;
  private crouch = 0;
  private crouchV = 0;
  private launch = 0;
  private squash = 0;
  private squashV = 0;
  private blink = 0;
  private blinkAt = 2.2;
  private slowBlink = 0;
  private earTwitch = [0, 0];
  private earAt = 3;
  private lookX = 0.25;
  private lookY = 0;
  private pupil = 0.45;
  private bowFlap = 0;
  private tailA: number[] = [];
  private tailW: number[] = [];
  private lastBase = Math.PI;
  private pose: Pose = sitPose();
  private happy = 0;
  private color: HTMLCanvasElement | null = null;
  private sil: HTMLCanvasElement | null = null;
  private rimC: HTMLCanvasElement | null = null;

  constructor() {
    const base = Math.PI - 1.15;
    this.lastBase = base;
    for (let i = 0; i < TAIL_N; i++) {
      const q = i / (TAIL_N - 1);
      this.tailA.push(base - 2.3 * q * q);
      this.tailW.push(0);
    }
  }

  /** Physics events: kick the springs. */
  jumped() {
    this.launch = 1;
    this.squashV -= 3.2;
    this.sit = 0;
    this.idle = 0;
  }

  landed(impact: number) {
    const k = clamp(impact / 12, 0.15, 1);
    this.crouchV += 7 * k;
    this.squashV += 5.5 * k;
    this.launch = 0;
  }

  celebrate() {
    this.happy = 1;
  }

  get sitting() {
    return this.sit;
  }

  update(dt: number, d: OliveDrive) {
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    const t = this.t;
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);

    this.vx = d.vx;
    this.vy = lerp(this.vy, d.vy, ease(30));
    const sp = Math.abs(d.vx);
    if (d.grounded) this.speed = lerp(this.speed, sp, ease(14));
    this.runK = lerp(this.runK, smoothstep(5.0, 7.6, this.speed), ease(8));

    // Gait phase advances with distance so paws don't skate.
    const stride = strideFor(this.speed, this.runK);
    const stance = stanceFor(this.runK);
    if (d.grounded) this.gait = (this.gait + (this.speed * 60 * dt * stance) / stride) % 1;

    this.air = lerp(this.air, d.grounded ? 0 : 1, ease(d.grounded ? 30 : 16));
    this.glide = lerp(this.glide, d.gliding ? 1 : 0, ease(d.gliding ? 10 : 14));
    this.dive = lerp(this.dive, d.diving && !d.grounded ? 1 : 0, ease(14));
    this.skid = lerp(this.skid, d.skidding ? 1 : 0, ease(20));
    this.tired = lerp(this.tired, d.gliding && d.stamina < 0.25 ? 1 : 0, ease(8));
    this.launch = Math.max(0, this.launch - dt * 7);

    const still = d.grounded && sp < 0.2 && !d.busy;
    this.idle = still ? this.idle + dt : 0;
    const wantSit = (d.rest || this.idle > 4.5) && d.grounded;
    this.sit = lerp(this.sit, wantSit ? 1 : 0, ease(wantSit ? 3.2 : 14));
    this.happy = Math.max(0, this.happy - dt * 0.2);

    // Springs for the landing crouch and the squash.
    this.crouchV += (-220 * this.crouch - 18 * this.crouchV) * dt;
    this.crouch += this.crouchV * dt;
    this.squashV += (-260 * this.squash - 16 * this.squashV) * dt;
    this.squash += this.squashV * dt;

    // Blinks: random, sometimes doubled, slow and contented while sitting.
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blink = 1;
      this.slowBlink = this.sit > 0.7 && Math.random() < 0.45 ? 1 : 0;
      this.blinkAt = 1.8 + Math.random() * 3.4;
      if (Math.random() < 0.18) this.blinkAt = 0.28;
    }
    this.blink = Math.max(0, this.blink - dt * (this.slowBlink ? 2.2 : 7.5));

    this.earAt -= dt;
    if (this.earAt <= 0) {
      this.earTwitch[Math.random() < 0.5 ? 0 : 1] = 1;
      this.earAt = 2 + Math.random() * 4;
    }
    this.earTwitch = this.earTwitch.map((e) => Math.max(0, e - dt * 6));

    // Eyes follow the look target, or the landing below while airborne.
    let lx = 0.3;
    let ly = 0;
    if (d.look) {
      const m = Math.hypot(d.look.x, d.look.y) || 1;
      lx = d.look.x / m;
      ly = d.look.y / m;
    }
    if (!d.grounded) {
      lx = 0.6;
      ly = clamp(this.vy / 10, -0.4, 0.9);
    }
    this.lookX = lerp(this.lookX, lx, ease(8));
    this.lookY = lerp(this.lookY, ly, ease(8));
    const excited = Math.max(this.glide, this.dive, this.happy, this.runK * 0.6);
    this.pupil = lerp(this.pupil, 0.35 + excited * 0.55, ease(4));
    this.bowFlap += dt * (6 + this.glide * 26 + this.runK * 10);

    this.pose = this.blend(t);
    this.updateTail(dt, t);
  }

  private blend(t: number): Pose {
    let ground = gaitPose(this.gait, this.speed, this.runK);
    // Breathing and a slow idle sway.
    ground.by += Math.sin(t * 2.3) * 0.35;
    ground.tailRaise += Math.sin(t * 1.3) * 0.08;
    if (this.skid > 0.01) ground = lerpPose(ground, skidPose(), this.skid);
    const sit = sitPose();
    sit.tailCurl += Math.sin(t * 1.7) * 0.12 + Math.sin(t * 7) * 0.25 * this.happy;
    sit.by += Math.sin(t * 2.1) * 0.3;
    ground = lerpPose(ground, sit, smooth(this.sit));

    let air = airPose(this.vy, this.vx);
    if (this.launch > 0) {
      // Push-off: hind legs still driving into the cushion for a few frames.
      const L = smooth(this.launch);
      air = lerpPose(air, { ...air, meta: [-0.5, -0.6], pitch: air.pitch - 0.12 }, L);
      air.feet[FAR_HIND] = lerpV(air.feet[FAR_HIND], vec(HOME_HIND - 9, -PAW_R + 6 * (1 - L)), L);
      air.feet[NEAR_HIND] = lerpV(
        air.feet[NEAR_HIND],
        vec(HOME_HIND - 13, -PAW_R + 6 * (1 - L)),
        L,
      );
    }
    if (this.glide > 0.01) air = lerpPose(air, glidePose(t, this.tired), smooth(this.glide));
    if (this.dive > 0.01) air = lerpPose(air, divePose(), smooth(this.dive));

    const pose = lerpPose(ground, air, smooth(this.air));
    // Landing crouch drops the body; the legs absorb it through IK.
    const c = clamp(this.crouch, -0.3, 1.2);
    pose.by += c * 8 * (1 - this.air);
    pose.neck += c * 0.12;
    pose.headTilt += c * 0.1;
    pose.neck += Math.sin(t * 3) * 0.04 * this.happy;

    // Keep planted paws on the ground: if a leg can't reach, lower the body.
    if (this.air < 0.5) {
      const f = frameOf(pose.bx, pose.by, pose.pitch, pose.stretch);
      let need = 0;
      for (let i = 0; i < 4; i++) {
        const foot = pose.feet[i]!;
        if (foot.y < -PAW_R - 0.5) continue;
        const front = i >= 2;
        let gap: number;
        if (front) {
          gap = len(sub(foot, f.shoulderJoint)) - (FRONT_UPPER + FRONT_LOWER) * 0.97;
        } else {
          const m = pose.meta[i === FAR_HIND ? 0 : 1];
          const hock = sub(foot, mul(vec(Math.sin(m), Math.cos(m)), META));
          gap = len(sub(hock, f.hipJoint)) - (THIGH + SHIN) * 0.97;
        }
        need = Math.max(need, gap);
      }
      pose.by += need * (1 - this.air);
    }
    return pose;
  }

  private updateTail(dt: number, t: number) {
    const p = this.pose;
    const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
    // Unwrap so the tail never swings the long way round.
    const raw = Math.atan2(-f.fwd.y, -f.fwd.x) + p.tailRaise;
    const base = this.lastBase + wrap(raw - this.lastBase);
    const turn = base - this.lastBase;
    this.lastBase = base;
    const wave = p.tailWave;
    for (let i = 0; i < TAIL_N; i++) {
      const q = i / (TAIL_N - 1);
      const target =
        base +
        p.tailCurl * smoothstep(0.1, 1, q) * 1.1 +
        Math.sin(t * (2.2 + wave * 8) - i * 0.6) * wave * 0.3 * q;
      let a = this.tailA[i]!;
      a = target + wrap(a - target);
      a += turn * (1 - q) * 0.6;
      const stiff = lerp(140, 45, q);
      const damp = lerp(18, 8, q);
      let w = this.tailW[i]!;
      w += ((target - a) * stiff - w * damp) * dt;
      // Vertical motion flicks the tail against it.
      w += -this.vy * 0.015 * q * (this.air > 0.5 ? 1 : 0);
      this.tailW[i] = w;
      this.tailA[i] = a + w * dt;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Compositing                                                             */
  /* ---------------------------------------------------------------------- */

  /** Where the last prepared frame sits on the canvas, in device pixels. */
  private placed: { ox: number; oy: number } | null = null;

  /**
   * Paint this frame offscreen, at the feet point in the context's current
   * world transform. `facing` mirrors the rig.
   */
  prepare(ctx: CanvasRenderingContext2D, x: number, y: number, facing: 1 | -1, scale = 1) {
    const m = ctx.getTransform();
    const s = Math.hypot(m.a, m.b) * scale;
    this.placed = null;
    if (!(s > 0)) return;
    const px = m.a * x + m.c * y + m.e;
    const py = m.b * x + m.d * y + m.f;
    const W = Math.ceil(BOUND_X * 2 * s);
    const H = Math.ceil((BOUND_UP + BOUND_DOWN) * s);
    const ax = Math.round(BOUND_X * s);
    const ay = Math.round(BOUND_UP * s);
    const ix = Math.floor(px);
    const iy = Math.floor(py);

    this.color ??= makeCanvas();
    this.sil ??= makeCanvas();
    this.rimC ??= makeCanvas();
    for (const c of [this.color, this.sil, this.rimC]) {
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
    }
    const cc = this.color.getContext("2d");
    const sc = this.sil.getContext("2d");
    const rc = this.rimC.getContext("2d");
    if (!cc || !sc || !rc) return;

    // 1. Paint the parts.
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.clearRect(0, 0, W, H);
    const sq = clamp(this.squash * 0.06, -0.14, 0.16);
    cc.setTransform(
      facing * s * (1 + sq * 0.6),
      0,
      0,
      s * (1 - sq),
      ax + (px - ix),
      ay + (py - iy),
    );
    cc.lineJoin = "round";
    cc.lineCap = "round";
    this.paint(cc);

    // 2. Silhouette outline: dilate the cat and tint it.
    const r = clamp(1.2 * s, 1.3, 4.2);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = "source-over";
    sc.clearRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      sc.drawImage(this.color, Math.cos(a) * r, Math.sin(a) * r);
    }
    sc.globalCompositeOperation = "source-in";
    sc.fillStyle = C.outline;
    sc.fillRect(0, 0, W, H);
    sc.globalCompositeOperation = "source-over";

    // 3. Rim light: the top edge of the cat, as if lit from the windows.
    const d = clamp(1.7 * s, 1.5, 5.5);
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = "source-over";
    rc.clearRect(0, 0, W, H);
    rc.drawImage(this.color, 0, 0);
    rc.globalCompositeOperation = "source-in";
    rc.fillStyle = C.rim;
    rc.fillRect(0, 0, W, H);
    rc.globalCompositeOperation = "destination-out";
    rc.drawImage(this.color, -d * 0.35, d);
    rc.globalCompositeOperation = "source-over";

    this.placed = { ox: ix - ax, oy: iy - ay };
    this.lastScale = s;
  }

  private lastScale = 1;

  /** Draw the prepared frame: soft halo, outline, colour, rim light. */
  composite(ctx: CanvasRenderingContext2D, alpha = 1) {
    if (!this.placed || !this.color || !this.sil || !this.rimC) return;
    const { ox, oy } = this.placed;
    const s = this.lastScale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(12, 8, 20, 0.45)";
    ctx.shadowBlur = clamp(5 * s, 4, 18);
    ctx.shadowOffsetY = clamp(1.5 * s, 1, 4);
    ctx.drawImage(this.sil, ox, oy);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(this.color, ox, oy);
    ctx.globalAlpha = alpha * 0.55;
    ctx.drawImage(this.rimC, ox, oy);
    ctx.restore();
  }

  /** Mirror the prepared frame in a polished floor at world y `floorY`. */
  reflect(ctx: CanvasRenderingContext2D, floorY: number, alpha: number) {
    if (!this.placed || !this.color || alpha <= 0.01) return;
    const m = ctx.getTransform();
    const fy = m.d * floorY + m.f;
    const { ox, oy } = this.placed;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(0, fy, ctx.canvas.width, ctx.canvas.height);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.translate(0, fy * 2);
    ctx.scale(1, -1);
    ctx.drawImage(this.color, ox, oy);
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, facing: 1 | -1, scale = 1, alpha = 1) {
    this.prepare(ctx, x, y, facing, scale);
    this.composite(ctx, alpha);
  }

  private paint(ctx: CanvasRenderingContext2D) {
    const p = this.pose;
    const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
    const legs = this.solveLegs(p, f);
    const tail = this.tailPoints(f);
    const sitting = this.sit > 0.55;
    const head = this.headPlacement(p, f);
    const body = this.bodyPath(f, p.arch);

    this.drawLeg(ctx, legs[FAR_HIND]!, true, false);
    this.drawLeg(ctx, legs[FAR_FRONT]!, true, true);
    if (!sitting) this.drawTail(ctx, tail);
    this.drawNeck(ctx, f, head);
    this.drawBody(ctx, body);
    this.drawLeg(ctx, legs[NEAR_HIND]!, false, false, body.path);
    if (sitting) this.drawTail(ctx, tail);
    this.drawLeg(ctx, legs[NEAR_FRONT]!, false, true, body.path);
    this.drawJawShadow(ctx, head);
    this.drawHead(ctx, head.pos, head.angle);
    this.drawBow(ctx, head);
  }

  /** Where the head sits; also used by the bow. */
  private headPlacement(p: Pose, f: Frame) {
    const neckRoot = add(f.shoulder, add(mul(f.fwd, 4), mul(f.up, 1)));
    const angle = p.pitch * 0.45 + p.neck;
    const pos = add(neckRoot, rot(vec(13, -10.5), angle));
    return { pos, angle: p.headTilt + p.pitch * 0.25, neckRoot };
  }

  private solveLegs(p: Pose, f: Frame): Leg[] {
    const out: Leg[] = [];
    for (let i = 0; i < 4; i++) {
      const front = i >= 2;
      const far = i === FAR_HIND || i === FAR_FRONT;
      const shift = far ? add(mul(f.fwd, 2.5), mul(f.up, 1.5)) : vec(0, 0);
      const target = p.feet[i]!;
      if (front) {
        const root = add(f.shoulderJoint, shift);
        const s = ik(root, target, FRONT_UPPER, FRONT_LOWER, 1);
        out.push({ pts: [root, s.mid, s.end], paw: s.end, pawAngle: p.paw[i]! });
      } else {
        const root = add(f.hipJoint, shift);
        const m = p.meta[i === FAR_HIND ? 0 : 1];
        const dir = vec(Math.sin(m), Math.cos(m));
        const s = ik(root, sub(target, mul(dir, META)), THIGH, SHIN, -1);
        const paw = add(s.end, mul(dir, META));
        out.push({ pts: [root, s.mid, s.end, paw], paw, pawAngle: p.paw[i]! });
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Parts                                                                   */
  /* ---------------------------------------------------------------------- */

  private bodyPath(f: Frame, arch: number) {
    const ctrl = add(lerpV(f.hip, f.shoulder, 0.5), mul(f.up, arch));
    const spine = (u: number) => {
      const a = lerpV(f.hip, ctrl, u);
      const b = lerpV(ctrl, f.shoulder, u);
      const tan = norm(sub(b, a));
      return { p: lerpV(a, b, u), n: vec(tan.y, -tan.x), t: tan };
    };
    const top = (u: number) =>
      9.5 + 1.8 * Math.exp(-((u - 0.1) ** 2) / 0.012) - 1.2 * Math.exp(-((u - 0.55) ** 2) / 0.04);
    const bot = (u: number) =>
      lerp(12.5, 20, smoothstep(0.2, 0.9, u)) - 2.4 * Math.exp(-((u - 0.3) ** 2) / 0.02);
    const pts: V[] = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const s = spine(u);
      pts.push(add(s.p, mul(s.n, top(u))));
    }
    // Chest: round forward and down into a fluffy bib.
    const s1 = spine(1);
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      const fluff = i > 2 && i < 7 ? (i % 2 ? 1.4 : -0.4) : 0;
      const r = lerp(top(1), bot(1), (1 - Math.cos(a)) / 2) + 7 * Math.sin(a) + fluff;
      pts.push(add(s1.p, add(mul(s1.n, Math.cos(a) * r), mul(s1.t, Math.sin(a) * r * 0.8))));
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N;
      const s = spine(u);
      const fluff = i > 2 && i < 8 ? (i % 2 ? 0.7 : -0.3) : 0;
      pts.push(add(s.p, mul(s.n, -bot(u) - fluff)));
    }
    // Rump.
    const s0 = spine(0);
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const r = lerp(bot(0), top(0), (1 - Math.cos(a)) / 2) + 4 * Math.sin(a);
      pts.push(add(s0.p, add(mul(s0.n, -Math.cos(a) * r), mul(s0.t, -Math.sin(a) * r * 0.9))));
    }
    return { path: smoothClosed(pts), spine, top, bot };
  }

  private drawBody(ctx: CanvasRenderingContext2D, body: ReturnType<Olive["bodyPath"]>) {
    const { path, spine } = body;
    const s5 = spine(0.5);
    ctx.save();
    ctx.clip(path);
    const g = ctx.createLinearGradient(
      s5.p.x + s5.n.x * 12,
      s5.p.y + s5.n.y * 12,
      s5.p.x - s5.n.x * 18,
      s5.p.y - s5.n.y * 18,
    );
    g.addColorStop(0, C.tabbyLight);
    g.addColorStop(0.45, C.tabby);
    g.addColorStop(1, C.tabbyDark);
    ctx.fillStyle = g;
    ctx.fill(path);
    this.furTexture(ctx, path, 0.28);

    // Dark saddle along the spine, darker over the shoulders as in the photos.
    ctx.strokeStyle = C.stripe;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const s = spine(i / 12);
      const q = add(s.p, mul(s.n, 8.2));
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    const sh = spine(0.88);
    ctx.fillStyle = C.stripe;
    ctx.beginPath();
    ctx.ellipse(sh.p.x, sh.p.y + 1, 9, 11, Math.atan2(sh.t.y, sh.t.x), 0, TAU);
    ctx.fill();

    // Mackerel stripes: thin, wavy, tapering down the flank.
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = C.stripe;
    const stripes = [0.04, 0.14, 0.25, 0.36, 0.47, 0.58, 0.69, 0.8];
    stripes.forEach((u, i) => {
      const s = spine(u);
      const depth = 8 + (i % 3) * 2.5;
      const wob = (i % 2 ? 1 : -1) * 1.6;
      const w = 1.25 + (i % 2) * 0.35;
      const a = add(s.p, mul(s.n, 9.5));
      const m = add(s.p, mul(s.t, wob));
      const b = add(add(s.p, mul(s.n, -depth)), mul(s.t, -wob * 0.6 - 1.5));
      ctx.beginPath();
      ctx.moveTo(a.x - s.t.x * w, a.y - s.t.y * w);
      ctx.quadraticCurveTo(m.x - s.t.x * w * 1.2, m.y - s.t.y * w * 1.2, b.x, b.y);
      ctx.quadraticCurveTo(
        m.x + s.t.x * w * 1.2,
        m.y + s.t.y * w * 1.2,
        a.x + s.t.x * w,
        a.y + s.t.y * w,
      );
      ctx.closePath();
      ctx.fill();
      // A broken fleck below some stripes.
      if (i % 2 === 0) {
        const c = add(add(s.p, mul(s.n, -depth - 3.5)), mul(s.t, -2));
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 0.9, 1.8, Math.atan2(s.n.y, s.n.x), 0, TAU);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // White: chest, belly, and the splash on the flank.
    ctx.fillStyle = C.white;
    ctx.beginPath();
    const edge: V[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const s = spine(u);
      const off = lerp(-12, -1.5, smoothstep(0.4, 1, u)) + Math.sin(u * 23) * 0.7;
      edge.push(add(s.p, mul(s.n, off)));
    }
    const s1 = spine(1);
    edge.push(add(s1.p, add(mul(s1.n, 6), mul(s1.t, 5))));
    edge.push(add(s1.p, add(mul(s1.n, 6), mul(s1.t, 30))));
    edge.push(add(s1.p, add(mul(s1.n, -40), mul(s1.t, 30))));
    const s0 = spine(0);
    edge.push(add(s0.p, mul(s0.n, -40)));
    ctx.moveTo(edge[0]!.x, edge[0]!.y);
    for (const q of edge) ctx.lineTo(q.x, q.y);
    ctx.closePath();
    ctx.fill();
    const sp = spine(0.4);
    const splash = add(sp.p, mul(sp.n, -8.5));
    ctx.beginPath();
    ctx.ellipse(splash.x, splash.y, 5, 3, Math.atan2(sp.t.y, sp.t.x) - 0.6, 0, TAU);
    ctx.fill();

    // Volume: warm light on top, cool shade under the belly.
    const shade = ctx.createLinearGradient(
      s5.p.x + s5.n.x * 14,
      s5.p.y + s5.n.y * 14,
      s5.p.x - s5.n.x * 22,
      s5.p.y - s5.n.y * 22,
    );
    shade.addColorStop(0, "rgba(255, 236, 200, 0.22)");
    shade.addColorStop(0.35, "rgba(255, 236, 200, 0)");
    shade.addColorStop(0.68, "rgba(60, 50, 90, 0)");
    shade.addColorStop(1, "rgba(60, 50, 90, 0.32)");
    ctx.fillStyle = shade;
    ctx.fill(path);
    ctx.restore();
  }

  private furTexture(ctx: CanvasRenderingContext2D, path: Path2D, alpha: number) {
    const pat = fur(ctx);
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    pat.setTransform?.(new DOMMatrix().scale(0.32, 0.32));
    ctx.fillStyle = pat;
    ctx.fill(path);
    ctx.restore();
  }

  /** Smooth tapered outline around a chain of joints. */
  private limbPath(pts: V[], hw: number[]): Path2D {
    const L: V[] = [];
    const R: V[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(pts.length - 1, i + 1)]!;
      const t = norm(sub(b, a));
      const n = vec(-t.y, t.x);
      L.push(add(pts[i]!, mul(n, hw[i]!)));
      R.push(add(pts[i]!, mul(n, -hw[i]!)));
    }
    const t0 = norm(sub(pts[1]!, pts[0]!));
    const start = sub(pts[0]!, mul(t0, hw[0]! * 0.9));
    return smoothClosed([start, ...L, ...R.reverse()]);
  }

  private drawLeg(
    ctx: CanvasRenderingContext2D,
    leg: Leg,
    far: boolean,
    front: boolean,
    body?: Path2D,
  ) {
    const pts = leg.pts;
    const hw = front ? [6, 4, 3.1] : [10, 6, 3.3, 3];
    const path = this.limbPath(pts, hw);
    const pawC = add(leg.paw, rot(vec(1.6, 0.1), leg.pawAngle));
    const paw = new Path2D();
    paw.ellipse(pawC.x, pawC.y, PAW_R + 1.6, PAW_R, leg.pawAngle, 0, TAU);

    ctx.save();
    ctx.fillStyle = front ? C.white : C.tabby;
    ctx.fill(path);
    ctx.clip(path);
    if (!front) {
      // Haunch light and stripes curving round the thigh.
      const hc = lerpV(pts[0]!, pts[1]!, 0.45);
      const g = ctx.createLinearGradient(hc.x, hc.y - 12, hc.x + 4, hc.y + 12);
      g.addColorStop(0, C.tabbyLight);
      g.addColorStop(0.5, C.tabby);
      g.addColorStop(1, C.tabbyDark);
      ctx.fillStyle = g;
      ctx.fill(path);
      this.furTexture(ctx, path, 0.25);
      ctx.strokeStyle = C.stripe;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.8;
      const along = norm(sub(pts[1]!, pts[0]!));
      const across = vec(-along.y, along.x);
      for (let k = 0; k < 4; k++) {
        const c = add(lerpV(pts[0]!, pts[1]!, 0.15 + k * 0.22), mul(across, 2));
        ctx.beginPath();
        ctx.moveTo(c.x - across.x * 9, c.y - across.y * 9);
        ctx.quadraticCurveTo(
          c.x + along.x * 3,
          c.y + along.y * 3,
          c.x + across.x * 9,
          c.y + across.y * 9,
        );
        ctx.stroke();
      }
      for (const q of [0.35, 0.7]) {
        const c = lerpV(pts[1]!, pts[2]!, q);
        const dir = norm(sub(pts[2]!, pts[1]!));
        const n = vec(-dir.y, dir.x);
        line(ctx, add(c, mul(n, 4)), add(c, mul(n, -4)));
      }
      ctx.globalAlpha = 1;
      // White sock from just above the hock down.
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 9;
      line(ctx, lerpV(pts[1]!, pts[2]!, 0.82), pts[3]!);
    } else {
      // Soft shading down the back of the white foreleg.
      const dir = norm(sub(pts[2]!, pts[0]!));
      const n = vec(dir.y, -dir.x);
      const mid = lerpV(pts[0]!, pts[2]!, 0.5);
      const g = ctx.createLinearGradient(
        mid.x + n.x * 5,
        mid.y + n.y * 5,
        mid.x - n.x * 5,
        mid.y - n.y * 5,
      );
      g.addColorStop(0, "rgba(92, 84, 120, 0.28)");
      g.addColorStop(0.6, "rgba(92, 84, 120, 0)");
      ctx.fillStyle = g;
      ctx.fill(path);
    }
    ctx.restore();

    ctx.fillStyle = C.white;
    ctx.fill(paw);
    ctx.save();
    ctx.clip(paw);
    ctx.fillStyle = C.whiteShade;
    ctx.beginPath();
    ctx.ellipse(pawC.x, pawC.y + PAW_R * 0.9, PAW_R + 2, PAW_R * 0.7, leg.pawAngle, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Internal edge: only where the leg is outside the body.
    ctx.save();
    if (body) {
      const outside = new Path2D();
      outside.rect(-500, -500, 1000, 1000);
      outside.addPath(body);
      ctx.clip(outside, "evenodd");
    }
    ctx.strokeStyle = C.inner;
    ctx.lineWidth = 0.9;
    ctx.stroke(path);
    ctx.stroke(paw);
    ctx.restore();
    if (!front && !far) {
      // A faint crease where the haunch meets the flank.
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = "rgba(39, 30, 25, 0.28)";
      ctx.lineWidth = 1;
      ctx.stroke(path);
      ctx.restore();
    }
    if (far) {
      // Far legs sit in Olive's own shadow.
      ctx.save();
      ctx.fillStyle = "rgba(30, 24, 48, 0.3)";
      ctx.fill(path);
      ctx.fill(paw);
      ctx.restore();
    }
  }

  private tailPoints(f: Frame): V[] {
    const base = add(f.hip, add(mul(f.fwd, -9), mul(f.up, 5)));
    const pts: V[] = [base];
    let cur = base;
    // On the ground the tail lies along the floor instead of through it.
    const floor = this.air < 0.5 ? -3.4 : Infinity;
    for (let i = 0; i < TAIL_N; i++) {
      cur = add(cur, mul(rot(vec(1, 0), this.tailA[i]!), TAIL_SEG));
      if (cur.y > floor) cur = vec(cur.x, floor);
      pts.push(cur);
    }
    return pts;
  }

  private drawTail(ctx: CanvasRenderingContext2D, pts: V[]) {
    const hw = pts.map((_, i) => {
      const q = i / (pts.length - 1);
      return lerp(4, 3.1, q);
    });
    const tip = pts[pts.length - 1]!;
    const dir = norm(sub(tip, pts[pts.length - 2]!));
    const path = this.limbPath([...pts, add(tip, mul(dir, 2.6))], [...hw, 1.6]);
    ctx.save();
    ctx.fillStyle = C.tabby;
    ctx.fill(path);
    ctx.clip(path);
    this.furTexture(ctx, path, 0.25);
    // Rings, then the dark tip.
    ctx.strokeStyle = C.stripe;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = 0.8;
    for (let i = 2; i < pts.length - 2; i += 2) {
      const a = pts[i]!;
      const t = norm(sub(pts[i + 1]!, a));
      const n = vec(-t.y, t.x);
      ctx.beginPath();
      ctx.moveTo(a.x + n.x * 6, a.y + n.y * 6);
      ctx.quadraticCurveTo(a.x - t.x * 1.5, a.y - t.y * 1.5, a.x - n.x * 6, a.y - n.y * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 10;
    ctx.beginPath();
    const k0 = pts.length - 2;
    ctx.moveTo(pts[k0]!.x, pts[k0]!.y);
    for (let i = k0 + 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.lineTo(tip.x + dir.x * 4, tip.y + dir.y * 4);
    ctx.stroke();
    // Light along the upper side.
    const mid = pts[Math.floor(pts.length / 2)]!;
    const g = ctx.createLinearGradient(mid.x, mid.y - 6, mid.x, mid.y + 6);
    g.addColorStop(0, "rgba(255, 236, 200, 0.2)");
    g.addColorStop(1, "rgba(40, 30, 60, 0.2)");
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();
  }

  private drawNeck(ctx: CanvasRenderingContext2D, f: Frame, head: { pos: V }) {
    // A thick neck bridging chest and head: tabby nape, white throat.
    const a = add(f.shoulder, mul(f.up, 2));
    const b = head.pos;
    ctx.strokeStyle = C.tabby;
    ctx.lineWidth = 21;
    line(ctx, a, b);
    const down = mul(f.up, -1);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 15;
    line(ctx, add(add(a, mul(down, 6)), mul(f.fwd, 4)), add(add(b, mul(down, 6)), mul(f.fwd, 2)));
    // Two dark bars across the nape.
    ctx.save();
    ctx.strokeStyle = C.stripe;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    const d = norm(sub(b, a));
    const n = vec(d.y, -d.x);
    for (const q of [0.3, 0.6]) {
      const c = lerpV(a, b, q);
      line(ctx, add(c, mul(n, 10)), add(c, mul(n, 3)));
    }
    ctx.restore();
  }

  private drawJawShadow(ctx: CanvasRenderingContext2D, head: { pos: V; angle: number }) {
    // Separates the white chin from the white bib.
    const c = add(head.pos, rot(vec(3, 13), head.angle));
    const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, 13);
    g.addColorStop(0, "rgba(70, 60, 100, 0.3)");
    g.addColorStop(1, "rgba(70, 60, 100, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 16, 7, head.angle, 0, TAU);
    ctx.fill();
  }

  private drawHead(ctx: CanvasRenderingContext2D, pos: V, angle: number) {
    const t = this.t;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    const earBack = this.pose.ears;
    this.drawEar(ctx, false, earBack, this.earTwitch[1]!, t);
    this.drawEar(ctx, true, earBack, this.earTwitch[0]!, t);

    // Skull, cheeks and muzzle as one silhouette.
    const head = new Path2D();
    head.moveTo(-15, -3);
    head.bezierCurveTo(-16, -12, -9, -17.5, 0, -17);
    head.bezierCurveTo(9, -16.5, 16, -12, 17.5, -4);
    head.bezierCurveTo(19, 0, 21.5, 2.5, 21.2, 6);
    head.bezierCurveTo(21, 9.5, 17.5, 11.5, 13, 12.2);
    head.bezierCurveTo(9, 15, 2, 15.2, -3, 13.2);
    // Cheek ruff.
    head.bezierCurveTo(-7, 12.8, -9, 11.2, -12, 11.6);
    head.bezierCurveTo(-11.2, 10, -13.8, 9.2, -16.4, 8.6);
    head.bezierCurveTo(-15, 7.2, -17.6, 5.6, -17.5, 3.6);
    head.bezierCurveTo(-16.6, 2, -15.6, 0.5, -15, -3);
    head.closePath();

    ctx.save();
    ctx.clip(head);
    const g = ctx.createLinearGradient(-6, -18, 4, 14);
    g.addColorStop(0, C.tabbyLight);
    g.addColorStop(0.55, C.tabby);
    g.addColorStop(1, C.tabbyDark);
    ctx.fillStyle = g;
    ctx.fill(head);
    this.furTexture(ctx, head, 0.2);
    // Ginger warmth around the eyes, as in the photos.
    ctx.fillStyle = C.warm;
    ctx.beginPath();
    ctx.ellipse(-4, -7.5, 7, 5, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(13, -8.5, 4.5, 4, 0.2, 0, TAU);
    ctx.fill();

    // Forehead "M", crown stripes and cheek lines.
    ctx.strokeStyle = C.stripe;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.6;
    const strokes: [number, number, number, number, number, number][] = [
      [-1.5, -16.5, -0.5, -12.5, 0.6, -9.6],
      [-5.6, -16, -4.2, -12.4, -3.2, -9.9],
      [-9.8, -14, -8.2, -11.4, -7.2, -9.8],
      [10.4, -16.4, 10.1, -13, 9.5, -10.4],
      [13.6, -14.6, 13.2, -12, 12.4, -10.2],
      [-15.5, -2.2, -12, -1.8, -8.6, -2.4],
      [-16.6, 2.4, -12.5, 2.4, -8.4, 1.2],
      [-14, -9.6, -12.5, -7.6, -9.8, -6.9],
    ];
    for (const s of strokes) {
      ctx.beginPath();
      ctx.moveTo(s[0], s[1]);
      ctx.quadraticCurveTo(s[2], s[3], s[4], s[5]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The narrow white blaze up the forehead, widening into muzzle and chin.
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(3.6, -18);
    ctx.bezierCurveTo(4.6, -13, 4.2, -8.5, 4, -4.8);
    ctx.bezierCurveTo(2.6, -1.6, -1.6, 0.4, -5, 3);
    ctx.bezierCurveTo(-8, 5.5, -10.2, 8.5, -10.6, 13.5);
    ctx.lineTo(24, 16);
    ctx.lineTo(24, 0);
    ctx.bezierCurveTo(19, -1.5, 15, -1.8, 11.6, -3.2);
    ctx.bezierCurveTo(9.4, -4.8, 8, -8, 7.6, -11.5);
    ctx.bezierCurveTo(7.3, -14, 7.2, -16, 7.4, -18);
    ctx.closePath();
    ctx.fill();
    // Shade under the jaw and a soft top light.
    const jaw = ctx.createLinearGradient(0, 4, 0, 15);
    jaw.addColorStop(0, "rgba(70, 60, 100, 0)");
    jaw.addColorStop(1, "rgba(70, 60, 100, 0.22)");
    ctx.fillStyle = jaw;
    ctx.fillRect(-20, 4, 44, 12);
    const top = ctx.createRadialGradient(2, -16, 2, 2, -12, 16);
    top.addColorStop(0, "rgba(255, 236, 200, 0.25)");
    top.addColorStop(1, "rgba(255, 236, 200, 0)");
    ctx.fillStyle = top;
    ctx.fillRect(-20, -20, 44, 20);
    ctx.restore();
    // Faint line where the head overlaps the ears and neck.
    ctx.strokeStyle = C.inner;
    ctx.lineWidth = 0.8;
    ctx.stroke(head);

    this.drawEye(ctx, -2.6, -4.2, 5.4, 5, -0.12, false);
    this.drawEye(ctx, 12.7, -4.8, 3.9, 4.7, 0.12, true);

    // Nose, philtrum and a small mouth.
    ctx.fillStyle = C.nose;
    ctx.strokeStyle = C.noseDark;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(14.6, 1.6);
    ctx.quadraticCurveTo(17.6, 0.6, 20.4, 1.4);
    ctx.quadraticCurveTo(20.6, 2.6, 18.4, 4.6);
    ctx.quadraticCurveTo(17.4, 5.4, 16.6, 4.6);
    ctx.quadraticCurveTo(14.4, 2.8, 14.6, 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(16.6, 1.9, 1.3, 0.55, -0.1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#8d6a62";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(17.5, 5);
    ctx.lineTo(17.4, 7);
    ctx.quadraticCurveTo(15.6, 9.2, 13.4, 8.2);
    ctx.moveTo(17.4, 7);
    ctx.quadraticCurveTo(19, 8.8, 20.6, 7.8);
    ctx.stroke();
    // Whisker pads.
    ctx.fillStyle = "rgba(120, 100, 110, 0.35)";
    for (const [x, y] of [
      [13.5, 5.6],
      [12.4, 7.2],
      [14.6, 7.4],
      [20.4, 5.4],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 0.35, 0, TAU);
      ctx.fill();
    }

    // Whiskers, drifting a little.
    const sway = Math.sin(t * 1.7) * 0.6 + this.glide * 2;
    ctx.strokeStyle = "rgba(255, 252, 245, 0.9)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of [
      [12, 6.5, -8, 2.5],
      [12, 7.5, -9, 8.5],
      [12.5, 8.5, -6, 14],
      [19.5, 5.5, 35, 1.5 - sway],
      [19.5, 6.5, 36, 7.5 - sway],
      [19, 7.6, 33, 12.5 - sway],
    ] as const) {
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 1.5, x1, y1);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawEar(
    ctx: CanvasRenderingContext2D,
    near: boolean,
    back: number,
    twitch: number,
    t: number,
  ) {
    // The near ear sits toward the back of the head and shows its pink
    // inside; the far ear is foreshortened past the blaze.
    const base = near ? vec(-6.5, -12.5) : vec(10.5, -13);
    const spin = (near ? -0.2 : 0.16) - back * 0.95 - twitch * 0.35 * Math.sin(t * 40);
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.rotate(spin);
    ctx.scale(1, 1 - back * 0.3);
    const w = near ? 9.8 : 7.8;
    const h = near ? 16.5 : 15.5;
    const lean = near ? -2 : 2.5;
    const ear = new Path2D();
    ear.moveTo(-w, 4);
    ear.bezierCurveTo(-w + 1, -h * 0.4, lean - 2.5, -h + 1, lean, -h);
    ear.bezierCurveTo(lean + 2.5, -h + 1.5, w - 1, -h * 0.4, w, 4.5);
    ear.closePath();
    ctx.fillStyle = C.tabby;
    ctx.fill(ear);
    ctx.save();
    ctx.clip(ear);
    const g0 = ctx.createLinearGradient(0, -h, 0, 4);
    g0.addColorStop(0, C.tabbyDark);
    g0.addColorStop(0.4, C.tabby);
    g0.addColorStop(1, C.tabbyLight);
    ctx.fillStyle = g0;
    ctx.fill(ear);
    ctx.restore();
    ctx.strokeStyle = C.inner;
    ctx.lineWidth = 0.8;
    ctx.stroke(ear);
    // Inner ear: pale pink with a fringe of white fur.
    const inner = new Path2D();
    const s = near ? 0.66 : 0.45;
    const off = near ? 0.6 : 2.4;
    inner.moveTo(-w * s + off, 3);
    inner.bezierCurveTo(-w * s + off + 0.5, -h * 0.35, lean - 1.5, -h * 0.8, lean + 0.2, -h * 0.82);
    inner.bezierCurveTo(lean + 1.4, -h * 0.72, w * s * 0.8 + off, -h * 0.35, w * s + off, 3.5);
    inner.closePath();
    const g = ctx.createLinearGradient(0, -h, 0, 3);
    g.addColorStop(0, C.pinkDeep);
    g.addColorStop(1, C.pinkIn);
    ctx.fillStyle = g;
    ctx.fill(inner);
    ctx.strokeStyle = "rgba(255, 250, 240, 0.95)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = -w * s + off + 1 + i * 1.8;
      ctx.moveTo(x, 3);
      ctx.quadraticCurveTo(x + 0.4, -2.5, x + 1.4 - i * 0.5, -5.5 - (i % 2) * 1.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawEye(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    tilt: number,
    far: boolean,
  ) {
    const blink = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    const content = this.sit * 0.12 + this.happy * 0.35;
    const open = clamp(1 - blink * 1.05 - content, 0, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Dark rim and the liner flick at the outer corner.
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 1, ry * Math.max(open, 0.12) + 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    const flick = far ? 1 : -1;
    ctx.moveTo(flick * (rx - 0.5), -0.8);
    ctx.quadraticCurveTo(flick * (rx + 2.5), -0.6, flick * (rx + 3.4), 0.8);
    ctx.quadraticCurveTo(flick * (rx + 2), 0.4, flick * (rx - 0.5), 0.8);
    ctx.fill();
    if (open > 0.08) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry * open, 0, 0, TAU);
      ctx.clip();
      const lx = this.lookX * rx * 0.28;
      const ly = this.lookY * ry * 0.25;
      const g = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, rx * 1.05);
      g.addColorStop(0, C.irisIn);
      g.addColorStop(0.55, C.irisMid);
      g.addColorStop(1, C.irisOut);
      ctx.fillStyle = g;
      ctx.fillRect(-rx - 1, -ry - 1, rx * 2 + 2, ry * 2 + 2);
      // Iris fibres.
      ctx.strokeStyle = "rgba(90, 110, 30, 0.35)";
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.moveTo(lx + Math.cos(a) * rx * 0.3, ly + Math.sin(a) * ry * 0.3);
        ctx.lineTo(lx + Math.cos(a) * rx, ly + Math.sin(a) * ry);
      }
      ctx.stroke();
      const pw = rx * lerp(0.18, 0.62, this.pupil) * (far ? 0.85 : 1);
      ctx.fillStyle = C.pupil;
      ctx.beginPath();
      ctx.ellipse(lx, ly, pw, ry * 0.86, 0, 0, TAU);
      ctx.fill();
      // Upper lid shadow and two catchlights.
      ctx.fillStyle = "rgba(20, 14, 10, 0.32)";
      ctx.beginPath();
      ctx.ellipse(0, -ry * open * 1.05, rx * 1.2, ry * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.ellipse(-rx * 0.3 + lx * 0.3, -ry * 0.36 * open, rx * 0.26, ry * 0.2, -0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(rx * 0.35, ry * 0.4 * open, rx * 0.11, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (open < 0.95) {
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        rx + 0.4,
        ry * Math.max(open, 0.05) + 0.4,
        0,
        0.05 * Math.PI,
        0.95 * Math.PI,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBow(ctx: CanvasRenderingContext2D, head: { pos: V; angle: number }) {
    // The collar wraps the throat just under the chin; the bow sits at the front.
    const a = head.angle * 0.6;
    const knot = add(head.pos, rot(vec(5, 16.5), a));
    ctx.save();
    ctx.translate(knot.x, knot.y);
    ctx.rotate(a + Math.sin(this.bowFlap * 0.5) * 0.04);
    ctx.scale(1.3, 1.3);
    // Collar band.
    ctx.strokeStyle = C.navyEdge;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-11.5, -5.5);
    ctx.quadraticCurveTo(-6, 1.2, 3.5, 0.4);
    ctx.stroke();
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Bell on its ring.
    const swing = Math.sin(this.bowFlap * 0.7) * 0.3 - this.vx * 0.03;
    ctx.save();
    ctx.translate(-3, 1.2);
    ctx.rotate(swing);
    ctx.strokeStyle = C.bellDark;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 1.3, 0.9, 0, TAU);
    ctx.stroke();
    const bg = ctx.createRadialGradient(-0.7, 3.2, 0.3, 0, 4, 2.6);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(0.45, C.bell);
    bg.addColorStop(1, C.bellDark);
    ctx.fillStyle = bg;
    ctx.strokeStyle = "#4a4f58";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(0, 4.1, 2.1, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.2, 4.8);
    ctx.lineTo(1.2, 4.8);
    ctx.stroke();
    ctx.restore();

    // Bow: a larger back bow with a smaller one layered on top, then the knot.
    const flap = 1 + Math.sin(this.bowFlap) * (0.04 + this.glide * 0.14);
    const loop = (dir: 1 | -1, w: number, h: number, back: boolean) => {
      const path = new Path2D();
      path.moveTo(0, -1.3);
      path.bezierCurveTo(dir * w * 0.45, -h * 0.95, dir * w * 1.02, -h * 0.85, dir * w, -h * 0.1);
      path.bezierCurveTo(dir * w * 1.03, h * 0.65, dir * w * 0.5, h * 0.95, 0, 1.3);
      path.closePath();
      ctx.save();
      ctx.scale(1, dir === 1 ? flap : 2 - flap);
      ctx.fillStyle = back ? C.navyDark : C.navy;
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      const sh = ctx.createLinearGradient(0, 0, dir * w, 0);
      sh.addColorStop(0, "rgba(0, 0, 20, 0.45)");
      sh.addColorStop(0.5, "rgba(0, 0, 20, 0)");
      sh.addColorStop(1, "rgba(120, 150, 255, 0.2)");
      ctx.fillStyle = sh;
      ctx.fillRect(-w - 2, -h - 2, w * 2 + 4, h * 2 + 4);
      ctx.fillStyle = C.dot;
      for (let gy = -h; gy <= h; gy += 1.7) {
        const row = Math.round(gy / 1.7);
        for (let gx = 0.7 + (row % 2 ? 0.85 : 0); gx <= w; gx += 1.7) {
          ctx.beginPath();
          ctx.arc(dir * gx, gy, 0.36, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.strokeStyle = C.navyEdge;
      ctx.lineWidth = 0.55;
      ctx.stroke(path);
      ctx.restore();
    };
    loop(-1, 8, 5.6, true);
    loop(1, 7, 5.2, true);
    loop(-1, 6.2, 4, false);
    loop(1, 5.4, 3.7, false);
    ctx.fillStyle = C.navyLight;
    ctx.strokeStyle = C.navyEdge;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.roundRect(-1.7, -2.2, 3.4, 4.4, 1.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(-1, -1.6, 0.8, 3.1);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------------ */
/* Path helpers                                                              */
/* ------------------------------------------------------------------------ */

function line(ctx: CanvasRenderingContext2D, a: V, b: V) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** A closed Catmull-Rom spline through the points. */
function smoothClosed(pts: V[]): Path2D {
  const path = new Path2D();
  const n = pts.length;
  path.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    path.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  path.closePath();
  return path;
}
