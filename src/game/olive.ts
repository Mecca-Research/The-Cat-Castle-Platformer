/**
 * Olive, drawn live as a vector rig and animated from hand-keyed clips.
 *
 * Every pose is a set of channels (body placement, spine bend, paw targets,
 * head, tail, face). Clips are keyframes on those channels, sampled with
 * smooth Hermite curves. A small state machine blends them: idle, walk,
 * trot and gallop by speed (phase-locked so feet stay planted), a skid on a
 * hard reverse, a leap or a tucked hop in the air by speed and fall rate, a
 * landing crouch, a quick turn-around, and when she is left alone a
 * sit-down that drifts into grooming and yawning. At the end she eats the
 * salmon.
 *
 * On top of the clips run a few physical touches: planted paws lock to the
 * floor, the head steadies itself through the gallop, and the tail, ears
 * and collar bell swing on springs.
 *
 * Local space: origin on the ground under Olive's middle, +x is the way she
 * faces, +y is down. Units are world pixels before the draw scale.
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
const frac = (x: number) => ((x % 1) + 1) % 1;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------------ */
/* Look                                                                      */
/* ------------------------------------------------------------------------ */

/* Palette, sampled from the photos: a brown mackerel tabby with white. */
const C = {
  outline: "#2a201a",
  inner: "rgba(42, 32, 26, 0.45)",
  tabby: "#8a7964",
  tabbyLight: "#b6a587",
  tabbyDark: "#5e4f3d",
  warm: "rgba(176, 112, 60, 0.3)",
  stripe: "#30261e",
  white: "#fbf8f3",
  shade: "rgba(86, 78, 118, 0.24)",
  pinkIn: "#f2cbc6",
  pinkDeep: "#d99597",
  nose: "#eda5ab",
  noseDark: "#b86c78",
  mouth: "#4a1f22",
  tongue: "#f08a96",
  irisIn: "#e3e078",
  irisMid: "#aec24b",
  irisOut: "#587523",
  pupil: "#141a0e",
  navy: "#1f3070",
  navyDark: "#121c48",
  navyLight: "#3a50a8",
  navyEdge: "#0b1030",
  dot: "#f3f5ff",
  bell: "#e6e9ee",
  bellDark: "#8a93a0",
  rim: "#ffe4b4",
};

/* ------------------------------------------------------------------------ */
/* Skeleton                                                                  */
/* ------------------------------------------------------------------------ */

/** Leg order everywhere: far hind, near hind, far front, near front. */
const FH = 0;
const NH = 1;
const FF = 2;
const NF = 3;

const PAW_R = 3.1;
const F_UPPER = 14;
const F_LOWER = 17;
const H_THIGH = 15;
const H_SHIN = 15;
const H_META = 10.5;
const HALF_SPINE = 21;
const STAND_Y = -37;
const BODY_X = -4;

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
    hipJoint: add(hip, add(mul(fwd, 2), mul(up, -2.5))),
    shoulderJoint: add(shoulder, add(mul(fwd, -1), mul(up, -5))),
    up,
    fwd,
  };
}

const STAND = frameOf(BODY_X, STAND_Y, 0, 1);
const HOME_HIND = STAND.hipJoint.x + 2;
const HOME_FRONT = STAND.shoulderJoint.x + 1;

/** Two-bone IK. `bend` +1 puts the middle joint behind (elbow), -1 ahead (knee). */
function ik(root: V, target: V, l1: number, l2: number, bend: number) {
  const d = sub(target, root);
  const dist = clamp(len(d), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(d.y, d.x);
  const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  return {
    mid: add(root, mul(rot(vec(1, 0), base + bend * a), l1)),
    end: add(root, mul(rot(vec(1, 0), base), dist)),
  };
}

/* ------------------------------------------------------------------------ */
/* Poses and keys                                                            */
/* ------------------------------------------------------------------------ */

type Pose = {
  bx: number;
  by: number;
  pitch: number;
  arch: number;
  stretch: number;
  feet: V[];
  paw: number[];
  meta: number[];
  /** 1 while a paw is planted and should not slide. */
  lock: number[];
  neck: number;
  head: number;
  tailRaise: number;
  tailCurl: number;
  tailWave: number;
  ears: number;
  /** 1 open, 0 shut. */
  eyes: number;
  mouth: number;
  tongue: number;
  /** Near front paw lifted to the face (grooming), with its spot on the face. */
  face: number;
  faceX: number;
  faceY: number;
};

const FIELDS = [
  "bx",
  "by",
  "pitch",
  "arch",
  "stretch",
  "neck",
  "head",
  "tailRaise",
  "tailCurl",
  "tailWave",
  "ears",
  "eyes",
  "mouth",
  "tongue",
  "face",
  "faceX",
  "faceY",
] as const;

function base(): Pose {
  return {
    bx: BODY_X,
    by: STAND_Y,
    pitch: 0,
    arch: 1.5,
    stretch: 1,
    feet: [
      vec(HOME_HIND + 4, -PAW_R),
      vec(HOME_HIND, -PAW_R),
      vec(HOME_FRONT - 3, -PAW_R),
      vec(HOME_FRONT, -PAW_R),
    ],
    paw: [0, 0, 0, 0],
    meta: [0.28, 0.28],
    lock: [1, 1, 1, 1],
    neck: 0,
    head: 0,
    tailRaise: 0.45,
    tailCurl: 1.6,
    tailWave: 0.25,
    ears: 0,
    eyes: 1,
    mouth: 0,
    tongue: 0,
    face: 0,
    faceX: 9,
    faceY: 10,
  };
}

/** Weighted blend of poses; weights need not sum to one. */
function blend(items: [Pose, number][]): Pose {
  let total = 0;
  for (const [, w] of items) total += Math.max(0, w);
  if (total <= 1e-6) return items[0]![0];
  const out = base();
  for (const f of FIELDS) out[f] = 0;
  for (let i = 0; i < 4; i++) {
    out.feet[i] = vec(0, 0);
    out.paw[i] = 0;
    out.lock[i] = 0;
  }
  out.meta = [0, 0];
  for (const [p, raw] of items) {
    const w = Math.max(0, raw) / total;
    if (w === 0) continue;
    for (const f of FIELDS) out[f] += p[f] * w;
    for (let i = 0; i < 4; i++) {
      out.feet[i] = add(out.feet[i]!, mul(p.feet[i]!, w));
      out.paw[i]! += p.paw[i]! * w;
      out.lock[i]! += p.lock[i]! * w;
    }
    out.meta[0]! += p.meta[0]! * w;
    out.meta[1]! += p.meta[1]! * w;
  }
  return out;
}

function mix(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return blend([
    [a, 1 - t],
    [b, t],
  ]);
}

type Keys = readonly (readonly [number, number])[];

/**
 * Sample scalar keyframes at `t` with a Hermite curve whose tangents come
 * from the neighbouring keys (Catmull-Rom, aware of uneven spacing).
 */
function keyed(t: number, keys: Keys, loop = true): number {
  const n = keys.length;
  if (n === 1) return keys[0]![1];
  if (loop) t = frac(t);
  else {
    if (t <= keys[0]![0]) return keys[0]![1];
    if (t >= keys[n - 1]![0]) return keys[n - 1]![1];
  }
  const at = (j: number): readonly [number, number] => {
    if (!loop) return keys[clamp(j, 0, n - 1)]!;
    const m = ((j % n) + n) % n;
    const lap = Math.floor(j / n);
    return [keys[m]![0] + lap, keys[m]![1]];
  };
  let i = -1;
  for (let k = 0; k < n; k++) if (keys[k]![0] <= t) i = k;
  if (i < 0) {
    i = n - 1;
    t += 1;
  }
  const k0 = at(i - 1);
  const k1 = at(i);
  const k2 = at(i + 1);
  const k3 = at(i + 2);
  const span = k2[0] - k1[0] || 1;
  const u = (t - k1[0]) / span;
  const m1 = ((k2[1] - k0[1]) / (k2[0] - k0[0] || 1)) * span;
  const m2 = ((k3[1] - k1[1]) / (k3[0] - k1[0] || 1)) * span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * k1[1] +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * k2[1] +
    (u3 - u2) * m2
  );
}

/* ------------------------------------------------------------------------ */
/* Gaits                                                                     */
/* ------------------------------------------------------------------------ */

type Swing = { x: Keys; lift: Keys; paw: Keys; meta?: Keys };

type Gait = {
  /** How far a planted paw travels back under the body. */
  sweep: number;
  /** Share of the cycle each paw is planted. */
  stance: number;
  offsets: readonly number[];
  front: Swing;
  hind: Swing;
  stanceMeta: readonly [number, number];
  body: (phase: number, p: Pose) => void;
};

/** Distance travelled per full cycle when planted paws do not slide. */
const cycleOf = (g: Gait) => g.sweep / g.stance;

const WALK: Gait = {
  sweep: 24,
  stance: 0.62,
  offsets: [0.5, 0, 0.75, 0.25],
  front: {
    x: [
      [0, -0.5],
      [0.5, 0.05],
      [1, 0.5],
    ],
    lift: [
      [0, 0],
      [0.4, 6],
      [0.78, 3.5],
      [1, 0],
    ],
    paw: [
      [0, -0.35],
      [0.38, 1],
      [0.8, 0.3],
      [1, 0],
    ],
  },
  hind: {
    x: [
      [0, -0.5],
      [0.5, 0.05],
      [1, 0.5],
    ],
    lift: [
      [0, 0],
      [0.45, 5.5],
      [1, 0],
    ],
    paw: [
      [0, -0.4],
      [0.4, -0.7],
      [1, 0],
    ],
    meta: [
      [0, -0.35],
      [0.45, 0.15],
      [1, 0.35],
    ],
  },
  stanceMeta: [0.38, -0.25],
  body(phase, p) {
    p.by = STAND_Y + 0.7 * Math.cos(TAU * 2 * phase);
    p.pitch = 0.012 * Math.sin(TAU * 2 * phase);
    p.neck = -0.03;
    p.tailRaise = 1.0;
    p.tailCurl = 1.8;
    p.tailWave = 0.35;
  },
};

const TROT: Gait = {
  sweep: 36,
  stance: 0.44,
  offsets: [0.5, 0, 0.03, 0.53],
  front: {
    x: [
      [0, -0.5],
      [0.3, -0.28],
      [0.7, 0.38],
      [1, 0.5],
    ],
    lift: [
      [0, 0],
      [0.3, 9.5],
      [0.66, 7],
      [1, 0],
    ],
    paw: [
      [0, -0.55],
      [0.3, 1.35],
      [0.72, 0.35],
      [1, 0],
    ],
  },
  hind: {
    x: [
      [0, -0.5],
      [0.35, -0.32],
      [0.75, 0.38],
      [1, 0.5],
    ],
    lift: [
      [0, 0],
      [0.35, 8],
      [0.75, 5],
      [1, 0],
    ],
    paw: [
      [0, -0.65],
      [0.4, -0.95],
      [0.8, 0.15],
      [1, 0],
    ],
    meta: [
      [0, -0.65],
      [0.4, -0.2],
      [0.8, 0.5],
      [1, 0.42],
    ],
  },
  stanceMeta: [0.45, -0.4],
  body(phase, p) {
    // Two bounces a cycle, lowest as each diagonal pair takes the weight.
    p.by = STAND_Y + 1.6 * Math.cos(TAU * 2 * (phase - 0.22)) + 0.6;
    p.pitch = 0.018 * Math.sin(TAU * 2 * phase);
    p.arch = 1.2;
    p.stretch = 1.02;
    p.neck = -0.07;
    p.tailRaise = 0.72;
    p.tailCurl = 1.35;
    p.tailWave = 0.5;
    p.ears = 0.08;
  },
};

const GALLOP: Gait = {
  sweep: 46,
  stance: 0.3,
  offsets: [0.07, 0, 0.48, 0.56],
  front: {
    x: [
      [0, -0.5],
      [0.22, -0.62],
      [0.5, -0.02],
      [0.78, 0.74],
      [1, 0.5],
    ],
    lift: [
      [0, 0],
      [0.22, 11],
      [0.5, 15],
      [0.78, 9],
      [1, 0],
    ],
    paw: [
      [0, -0.8],
      [0.25, 1.55],
      [0.55, 1.0],
      [0.82, -0.15],
      [1, 0],
    ],
  },
  hind: {
    x: [
      [0, -0.5],
      [0.2, -0.88],
      [0.5, -0.15],
      [0.8, 0.62],
      [1, 0.5],
    ],
    lift: [
      [0, 0],
      [0.2, 12],
      [0.5, 15],
      [0.8, 8],
      [1, 0],
    ],
    paw: [
      [0, -0.85],
      [0.2, -1.35],
      [0.55, -0.2],
      [0.85, 0.35],
      [1, 0],
    ],
    meta: [
      [0, -1.0],
      [0.2, -1.3],
      [0.5, 0.15],
      [0.8, 0.72],
      [1, 0.5],
    ],
  },
  stanceMeta: [0.5, -0.65],
  body(phase, p) {
    // Gathered (back arched, feet bunched) near 0.9; stretched out near 0.4.
    p.arch = keyed(phase, [
      [0, 9],
      [0.12, 6],
      [0.25, 1],
      [0.37, -4],
      [0.5, -3],
      [0.62, 2],
      [0.75, 7],
      [0.87, 11],
    ]);
    p.stretch = keyed(phase, [
      [0, 0.88],
      [0.12, 0.92],
      [0.25, 1.03],
      [0.37, 1.15],
      [0.5, 1.12],
      [0.62, 1.02],
      [0.75, 0.92],
      [0.87, 0.86],
    ]);
    p.pitch = keyed(phase, [
      [0, 0.07],
      [0.12, 0],
      [0.25, -0.1],
      [0.37, -0.07],
      [0.5, 0.05],
      [0.62, 0.12],
      [0.75, 0.08],
      [0.87, 0.05],
    ]);
    p.by =
      STAND_Y +
      2 +
      keyed(phase, [
        [0, 1.5],
        [0.12, 1],
        [0.25, -2.5],
        [0.42, -6],
        [0.55, 0.5],
        [0.66, 2],
        [0.8, -1.5],
        [0.93, -3.5],
      ]);
    p.bx =
      BODY_X +
      keyed(phase, [
        [0, -1],
        [0.37, 2],
        [0.62, 0],
        [0.87, -2],
      ]);
    p.neck = -0.1;
    p.ears = 0.38;
    p.tailRaise = keyed(phase, [
      [0, 0.38],
      [0.4, 0.12],
      [0.8, 0.45],
    ]);
    p.tailCurl = 0.7;
    p.tailWave = 0.45;
  },
};

function gaitPose(g: Gait, phase: number): Pose {
  const p = base();
  g.body(phase, p);
  const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
  for (let i = 0; i < 4; i++) {
    const front = i >= 2;
    const s = frac(phase + g.offsets[i]!);
    const home = front
      ? HOME_FRONT + (f.shoulderJoint.x - STAND.shoulderJoint.x)
      : HOME_HIND + (f.hipJoint.x - STAND.hipJoint.x);
    const sw = front ? g.front : g.hind;
    let x: number;
    let y = -PAW_R;
    let paw = 0;
    let meta = 0.3;
    let lock = 0;
    if (s < g.stance) {
      const q = s / g.stance;
      x = home + g.sweep * (0.5 - q);
      // Toes roll off at the end of the stance.
      paw = q > 0.72 ? (q - 0.72) * (front ? -2 : 2.4) : 0;
      meta = lerp(g.stanceMeta[0], g.stanceMeta[1], q);
      lock = smoothstep(0, 0.06, q) * (1 - smoothstep(0.9, 1, q));
    } else {
      const q = (s - g.stance) / (1 - g.stance);
      x = home + g.sweep * keyed(q, sw.x, false);
      y = -PAW_R - keyed(q, sw.lift, false);
      paw = keyed(q, sw.paw, false);
      if (sw.meta) meta = keyed(q, sw.meta, false);
    }
    if (i === FH || i === FF) x += 2.5;
    p.feet[i] = vec(x, y);
    p.paw[i] = paw;
    p.lock[i] = lock;
    if (!front) p.meta[i] = meta;
  }
  return p;
}

/* ------------------------------------------------------------------------ */
/* Still poses and clips                                                     */
/* ------------------------------------------------------------------------ */

function idlePose(t: number): Pose {
  const p = base();
  p.by += Math.sin(t * 2.4) * 0.35;
  p.bx += Math.sin(t * 0.7) * 0.5;
  p.head = Math.sin(t * 0.43) * 0.05;
  p.neck = Math.sin(t * 0.31) * 0.03;
  p.tailRaise = 0.45 + Math.sin(t * 0.9) * 0.08;
  p.tailWave = 0.3;
  return p;
}

function sitPose(t: number): Pose {
  const p = base();
  p.bx = -4.4;
  p.by = -24.1 + Math.sin(t * 2.1) * 0.3;
  p.pitch = -0.88;
  p.stretch = 0.72;
  p.arch = 3;
  p.feet = [vec(5, -PAW_R), vec(2, -PAW_R), vec(10, -PAW_R), vec(13.5, -PAW_R)];
  p.meta = [Math.PI / 2, Math.PI / 2];
  p.neck = 0.42;
  p.head = 0.22 + Math.sin(t * 0.5) * 0.04;
  p.tailRaise = -0.45;
  p.tailCurl = -1.8 + Math.sin(t * 1.3) * 0.12;
  p.tailWave = 0.06;
  return p;
}

/** Halfway down: hips first, front legs still straight. */
function sitMidPose(t: number): Pose {
  const s = sitPose(t);
  const p = mix(idlePose(t), s, 0.5);
  p.by = -30;
  p.pitch = -0.42;
  p.feet = [vec(-6, -PAW_R), vec(-9, -PAW_R), vec(12, -PAW_R), vec(15, -PAW_R)];
  p.meta = [1.1, 1.1];
  return p;
}

function sitDownPose(k: number, t: number): Pose {
  if (k < 0.45) return mix(idlePose(t), sitMidPose(t), smooth(k / 0.45));
  return mix(sitMidPose(t), sitPose(t), smooth((k - 0.45) / 0.55));
}

/** Lick a paw, then wash the face with it. */
function groomPose(k: number, t: number): Pose {
  const p = sitPose(t);
  const up = smoothstep(0, 0.14, k) * (1 - smoothstep(0.9, 1, k));
  p.face = up;
  const lick = k > 0.14 && k < 0.6;
  const wipe = smoothstep(0.58, 0.68, k) * (1 - smoothstep(0.86, 0.92, k));
  const wipePath = (k - 0.62) / 0.24;
  p.faceX = lerp(
    lerp(8, 10, Math.sin(t * 9) * 0.5 + 0.5),
    lerp(4, -6, frac(clamp(wipePath, 0, 0.999) * 2)),
    wipe,
  );
  p.faceY = lerp(
    11 + (lick ? Math.sin(t * 9) * 1.2 : 0),
    lerp(4, -8, frac(clamp(wipePath, 0, 0.999) * 2)),
    wipe,
  );
  p.neck += 0.16 * up;
  p.head += (0.22 + (lick ? Math.sin(t * 9) * 0.06 : 0)) * up - 0.3 * wipe;
  p.tongue = lick ? Math.max(0, Math.sin(t * 9)) : 0;
  p.eyes = lerp(1, 0.25, up);
  p.ears = 0.1 * wipe;
  return p;
}

function yawnPose(k: number, t: number): Pose {
  const p = sitPose(t);
  const open = smoothstep(0.1, 0.35, k) * (1 - smoothstep(0.62, 0.8, k));
  p.mouth = open;
  p.neck -= 0.12 * open;
  p.head -= 0.38 * open;
  p.eyes = 1 - open * 0.95;
  p.ears = 0.45 * open;
  p.by -= 1.2 * open;
  p.tongue = smoothstep(0.8, 0.86, k) * (1 - smoothstep(0.93, 1, k));
  return p;
}

/** Down to the dish, three bites, then sit back and lick the lips. */
function eatPose(k: number, t: number, standing: Pose): Pose {
  const lean = smoothstep(0, 0.2, k) * (1 - smoothstep(0.8, 0.95, k));
  const p = mix(standing, sitPose(t), smoothstep(0.8, 1, k));
  p.pitch += 0.16 * lean;
  p.by += 4 * lean;
  p.neck += 0.62 * lean;
  p.head += 0.32 * lean;
  p.feet[NF] = add(p.feet[NF]!, vec(4 * lean, 0));
  const chew = k > 0.22 && k < 0.78 ? Math.max(0, Math.sin((k - 0.22) * TAU * 5.3)) : 0;
  p.mouth = chew * 0.75;
  p.eyes = lerp(1, 0.6, lean);
  p.ears = 0.15 * lean;
  p.tongue = smoothstep(0.86, 0.9, k) * (1 - smoothstep(0.97, 1, k));
  p.tailRaise = lerp(p.tailRaise, 0.9, lean);
  p.tailCurl = lerp(p.tailCurl, 1.9, lean);
  return p;
}

/** Bracing against a reverse: leaning back, front paws planted ahead. */
function skidPose(): Pose {
  const p = base();
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
  p.paw = [0, 0, -0.35, -0.4];
  p.lock = [0, 0, 0, 0];
  p.tailRaise = 0.85;
  p.tailCurl = 0.6;
  p.ears = 0.5;
  return p;
}

/**
 * In the air, keyed on fall speed. `leap` blends a stretched running leap
 * with a tucked standing hop.
 */
function airPose(vy: number, leap: number, launch: number): Pose {
  const k = (keys: Keys) => keyed(vy, keys, false);
  const hop = base();
  hop.pitch = k([
    [-14, -0.32],
    [-6, -0.18],
    [0, 0],
    [6, 0.1],
    [14, 0.16],
  ]);
  hop.arch = k([
    [-14, -2],
    [-6, 2],
    [0, 6],
    [6, 2],
    [14, 0],
  ]);
  hop.stretch = k([
    [-14, 1.08],
    [-6, 1],
    [0, 0.94],
    [6, 0.98],
    [14, 1.02],
  ]);
  const run = base();
  run.pitch = k([
    [-14, -0.3],
    [-6, -0.18],
    [0, 0],
    [6, 0.14],
    [14, 0.22],
  ]);
  run.arch = k([
    [-14, -4],
    [-6, -3],
    [0, 2],
    [6, 2],
    [14, 0],
  ]);
  run.stretch = k([
    [-14, 1.14],
    [-6, 1.12],
    [0, 1],
    [6, 0.98],
    [14, 1.0],
  ]);
  const p = mix(hop, run, leap);
  p.by = STAND_Y - 2;
  const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
  const at = (root: V, off: V) => add(root, rot(off, p.pitch * 0.5));
  const pick = (hopKeys: [number, V][], runKeys: [number, V][]) => {
    const kx = (ks: [number, V][]) => k(ks.map(([v, o]) => [v, o.x] as const));
    const ky = (ks: [number, V][]) => k(ks.map(([v, o]) => [v, o.y] as const));
    return vec(lerp(kx(hopKeys), kx(runKeys), leap), lerp(ky(hopKeys), ky(runKeys), leap));
  };
  const front = pick(
    [
      [-14, vec(8, 9)],
      [-6, vec(6, 12)],
      [0, vec(6, 14)],
      [6, vec(10, 25)],
      [14, vec(12, 29)],
    ],
    [
      [-14, vec(24, 2)],
      [-6, vec(20, 6)],
      [0, vec(16, 14)],
      [6, vec(16, 24)],
      [14, vec(14, 29)],
    ],
  );
  const hind = pick(
    [
      [-14, vec(-4, 30)],
      [-6, vec(4, 22)],
      [0, vec(8, 16)],
      [6, vec(2, 24)],
      [14, vec(-2, 28)],
    ],
    [
      [-14, vec(-26, 14)],
      [-6, vec(-22, 12)],
      [0, vec(-8, 16)],
      [6, vec(0, 21)],
      [14, vec(2, 26)],
    ],
  );
  p.feet = [
    at(f.hipJoint, add(hind, vec(4, -1))),
    at(f.hipJoint, hind),
    at(f.shoulderJoint, add(front, vec(-4, -1.5))),
    at(f.shoulderJoint, front),
  ];
  const rise = smoothstep(-1, -9, vy);
  const apex = 1 - Math.max(rise, smoothstep(1, 8, vy));
  p.meta = [lerp(0.4, -1.1, rise * leap) + 0.5 * apex, lerp(0.4, -1.15, rise * leap) + 0.5 * apex];
  p.paw = [-0.5 * rise, -0.6 * rise, 1.2 * apex + 0.9 * rise, 1.3 * apex + 1.0 * rise];
  p.lock = [0, 0, 0, 0];
  p.neck = -0.1 * rise + 0.08 * smoothstep(2, 10, vy);
  p.head = -p.pitch * 0.6 + 0.1 * smoothstep(2, 10, vy);
  p.tailRaise = k([
    [-14, -0.3],
    [-6, -0.1],
    [0, 0.6],
    [6, 0.9],
    [14, 1.0],
  ]);
  p.tailCurl = k([
    [-14, 0.2],
    [0, 1.4],
    [14, 0.7],
  ]);
  p.tailWave = 0.15;
  p.ears = 0.25 * rise + 0.2 * smoothstep(6, 14, vy);
  if (launch > 0) {
    // Push-off: the hind paws are still driving into the cushion.
    const L = smooth(launch);
    p.feet[FH] = lerpV(p.feet[FH]!, vec(HOME_HIND - 8, -PAW_R + 4 * (1 - L)), L);
    p.feet[NH] = lerpV(p.feet[NH]!, vec(HOME_HIND - 12, -PAW_R + 4 * (1 - L)), L);
    p.meta = [lerp(p.meta[0]!, -0.6, L), lerp(p.meta[1]!, -0.7, L)];
    p.pitch -= 0.08 * L;
  }
  return p;
}

/* ------------------------------------------------------------------------ */
/* Rig                                                                       */
/* ------------------------------------------------------------------------ */

export type OliveDrive = {
  vx: number;
  vy: number;
  grounded: boolean;
  /** Reversing on the ground. */
  turning: boolean;
  facing: 1 | -1;
  /** Olive's middle in world x, and the draw scale, to pin planted paws. */
  worldX: number;
  scale: number;
  /** Sit and stay (title card). */
  rest: boolean;
  /** At the salmon: eat it. */
  eat: boolean;
  /** Input is held; breaks a sit. */
  busy: boolean;
  /** Where to look, in local space, or null. */
  look: V | null;
};

type Leg = { pts: V[]; paw: V; pawAngle: number };
type RestMode = "down" | "sit" | "groom" | "yawn";

const TAIL_N = 12;
const TAIL_SEG = 4.6;
const TURN_TIME = 0.11;
/** Offscreen bounds around the feet point, in local units. */
const BOUND_X = 108;
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
  for (let i = 0; i < 560; i++) {
    const x = rnd() * 96;
    const y = rnd() * 96;
    const a = 1.35 + (rnd() - 0.5) * 0.7;
    const l = 3 + rnd() * 5;
    g.strokeStyle = rnd() < 0.5 ? "rgba(255, 246, 228, 0.55)" : "rgba(30, 22, 16, 0.55)";
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
  private phase = 0;
  private speed = 0;
  private wWalk = 0;
  private wTrot = 0;
  private wGallop = 0;
  private air = 0;
  private vy = 0;
  private vx = 0;
  private leap = 0;
  private launch = 0;
  private skid = 0;
  private crouch = 0;
  private crouchV = 0;
  private squash = 0;
  private squashV = 0;
  // Resting: sit down, then groom or yawn now and then.
  private resting = true;
  private restW = 1;
  private restMode: RestMode = "sit";
  private restK = 1;
  private nextInterlude = 6;
  private idle = 0;
  // Eating at the end.
  private eatK = -1;
  private happy = 0;
  // Turning round.
  private facing: 1 | -1 = 1;
  private turnFrom: 1 | -1 = 1;
  private turnK = 1;
  // Face.
  private blink = 0;
  private blinkAt = 2.2;
  private slowBlink = 0;
  private earTwitch = [0, 0];
  private earAt = 3;
  private earLag = 0;
  private earLagV = 0;
  private lookX = 0.3;
  private lookY = 0;
  private pupil = 0.45;
  // Collar.
  private bell = 0;
  private bellV = 0;
  private bowFlap = 0;
  // Tail chain.
  private tailA: number[] = [];
  private tailW: number[] = [];
  private lastBase = Math.PI;
  // Paws pinned to the floor while planted.
  private locks = [0, 1, 2, 3].map(() => ({ on: false, wx: 0 }));
  // The head steadies itself while the body bounds underneath.
  private headY = 0;
  private headFix = 0;
  private pose: Pose = sitPose(0);
  private color: HTMLCanvasElement | null = null;
  private sil: HTMLCanvasElement | null = null;
  private rimC: HTMLCanvasElement | null = null;
  private placed: { ox: number; oy: number } | null = null;
  private lastScale = 1;

  constructor() {
    const b = Math.PI - 0.85;
    this.lastBase = b;
    for (let i = 0; i < TAIL_N; i++) {
      const q = i / (TAIL_N - 1);
      this.tailA.push(b - 1.9 * smoothstep(0.1, 1, q));
      this.tailW.push(0);
    }
  }

  /** Physics events: kick the springs and clips. */
  jumped() {
    this.launch = 1;
    this.squashV -= 3;
    this.wake();
  }

  landed(impact: number) {
    const k = clamp(impact / 13, 0.12, 1);
    this.crouchV += 7.5 * k;
    this.squashV += 5.5 * k;
    this.launch = 0;
    this.earLagV += 6 * k;
    this.bellV += 8 * k;
  }

  dropped() {
    this.squashV += 3;
    this.wake();
  }

  /** How much of the salmon is gone, 0..1. */
  get eaten() {
    return this.eatK < 0 ? 0 : smoothstep(0.24, 0.78, this.eatK);
  }

  get finishedEating() {
    return this.eatK >= 1;
  }

  private wake() {
    this.resting = false;
    this.idle = 0;
  }

  reset() {
    this.eatK = -1;
    this.happy = 0;
    this.wake();
  }

  update(dt: number, d: OliveDrive) {
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    const t = this.t;
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);

    // Turning round: a quick squeeze through the middle.
    if (d.facing !== this.facing) {
      this.turnFrom = this.facing;
      this.facing = d.facing;
      this.turnK = 0;
      for (const l of this.locks) l.on = false;
    }
    this.turnK = Math.min(1, this.turnK + dt / TURN_TIME);

    const prevVx = this.vx;
    this.vx = d.vx;
    this.vy = lerp(this.vy, d.vy, ease(30));
    const sp = Math.abs(d.vx);
    if (d.grounded) this.speed = lerp(this.speed, sp, ease(16));
    const gal = smoothstep(5.6, 7.8, this.speed);
    const trot = smoothstep(1.6, 4.2, this.speed) * (1 - gal);
    this.wGallop = gal;
    this.wTrot = trot;
    this.wWalk = 1 - gal - trot;
    const cycle =
      cycleOf(WALK) * this.wWalk + cycleOf(TROT) * this.wTrot + cycleOf(GALLOP) * this.wGallop;
    if (d.grounded) this.phase = frac(this.phase + ((this.speed / d.scale) * 60 * dt) / cycle);

    this.air = lerp(this.air, d.grounded ? 0 : 1, ease(d.grounded ? 32 : 18));
    if (!d.grounded) this.leap = lerp(this.leap, smoothstep(2.5, 7.5, sp), ease(6));
    else this.leap = smoothstep(2.5, 7.5, sp);
    this.skid = lerp(this.skid, d.turning && sp > 2.5 ? 1 : 0, ease(18));
    this.launch = Math.max(0, this.launch - dt * 8);

    // Rest: sit after a pause, then groom or yawn now and then.
    const still = d.grounded && sp < 0.15 && !d.busy && this.eatK < 0;
    this.idle = still ? this.idle + dt : 0;
    if ((d.rest || this.idle > 4) && d.grounded && !this.resting && this.eatK < 0) {
      this.resting = true;
      this.restMode = d.rest ? "sit" : "down";
      this.restK = d.rest ? 1 : 0;
      this.nextInterlude = 5 + Math.random() * 4;
    }
    if (this.resting && (!still || !d.grounded) && !d.rest) this.resting = false;
    this.restW = this.resting ? 1 : Math.max(0, this.restW - dt / 0.16);
    if (this.resting) this.stepRest(dt);

    // Eating at the salmon.
    if (d.eat && this.eatK < 0) this.eatK = 0;
    if (this.eatK >= 0) {
      this.eatK = Math.min(1, this.eatK + dt / 2.3);
      if (this.eatK >= 1) this.happy = Math.min(1, this.happy + dt * 2);
    }

    // Springs: landing crouch, squash and stretch, ears, bell.
    this.crouchV += (-210 * this.crouch - 17 * this.crouchV) * dt;
    this.crouch += this.crouchV * dt;
    this.squashV += (-260 * this.squash - 16 * this.squashV) * dt;
    this.squash += this.squashV * dt;
    const accel = (d.vx - prevVx) / Math.max(dt, 1e-3);
    this.earLagV += (-150 * this.earLag - 10 * this.earLagV - accel * 0.002 * d.facing) * dt;
    this.earLag += this.earLagV * dt;
    this.bellV += (-90 * this.bell - 3.5 * this.bellV + accel * 0.012 * d.facing) * dt;
    this.bell = clamp(this.bell + this.bellV * dt, -1.2, 1.2);

    // Blinks: random, sometimes doubled, slow and contented while sitting.
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blink = 1;
      this.slowBlink = this.resting && Math.random() < 0.45 ? 1 : 0;
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

    // Eyes: a look target, or the landing below while airborne.
    let lx = 0.3;
    let ly = 0.05;
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
    const excited = Math.max(this.wGallop * 0.7, this.air * 0.6, this.eatK >= 0 ? 1 : 0);
    this.pupil = lerp(this.pupil, 0.35 + excited * 0.5, ease(4));
    this.bowFlap += dt * (6 + this.wGallop * 12 + this.air * 10);

    this.pose = this.compose(t);
    this.pinPaws(d);
    this.ground(d);
    this.steadyHead(dt);
    this.updateTail(dt, t);
  }

  private stepRest(dt: number) {
    const dur = { down: 0.75, sit: 1, groom: 3.6, yawn: 2 }[this.restMode];
    this.restK = Math.min(1, this.restK + dt / dur);
    if (this.restMode === "down" && this.restK >= 1) {
      this.restMode = "sit";
      this.restK = 0;
    } else if ((this.restMode === "groom" || this.restMode === "yawn") && this.restK >= 1) {
      this.restMode = "sit";
      this.restK = 0;
      this.nextInterlude = 6 + Math.random() * 6;
    } else if (this.restMode === "sit") {
      this.nextInterlude -= dt;
      if (this.nextInterlude <= 0) {
        this.restMode = Math.random() < 0.6 ? "groom" : "yawn";
        this.restK = 0;
      }
    }
  }

  private compose(t: number): Pose {
    // On the ground: idle and the three gaits, all on one phase.
    const moving = smoothstep(0.05, 0.9, this.speed);
    let ground = blend([
      [idlePose(t), 1 - moving],
      [gaitPose(WALK, this.phase), moving * this.wWalk],
      [gaitPose(TROT, this.phase), moving * this.wTrot],
      [gaitPose(GALLOP, this.phase), moving * this.wGallop],
    ]);
    if (this.skid > 0.01) ground = mix(ground, skidPose(), this.skid);

    if (this.restW > 0) {
      let rest: Pose;
      if (this.restMode === "down") rest = sitDownPose(this.restK, t);
      else if (this.restMode === "groom") rest = groomPose(this.restK, t);
      else if (this.restMode === "yawn") rest = yawnPose(this.restK, t);
      else rest = sitPose(t);
      ground = mix(ground, rest, smooth(this.restW));
    }
    if (this.eatK >= 0) {
      const eat = eatPose(this.eatK, t, idlePose(t));
      if (this.happy > 0) {
        eat.eyes = lerp(eat.eyes, 0.18, this.happy);
        eat.tailCurl += Math.sin(t * 6) * 0.25 * this.happy;
        eat.by += Math.sin(t * 9) * 0.25 * this.happy;
      }
      ground = eat;
    }

    const air = airPose(this.vy, this.leap, this.launch);
    const p = mix(ground, air, smooth(this.air));
    // Landing crouch drops the body; the legs absorb it through IK.
    const c = clamp(this.crouch, -0.3, 1.2) * (1 - this.air);
    p.by += c * 8;
    p.arch += c * 2.5;
    p.neck += c * 0.14;
    p.head += c * 0.12;
    p.tailRaise -= c * 0.4;
    return p;
  }

  /** Planted paws keep their spot on the floor while the body moves over them. */
  private pinPaws(d: OliveDrive) {
    const p = this.pose;
    const grounded = this.air < 0.3 && this.turnK >= 1;
    for (let i = 0; i < 4; i++) {
      const lock = this.locks[i]!;
      const w = p.lock[i]! * (grounded ? 1 : 0);
      const foot = p.feet[i]!;
      if (w > 0.1 && foot.y > -PAW_R - 1) {
        const authored = d.worldX + this.facing * foot.x * d.scale;
        if (!lock.on && w > 0.55) {
          lock.on = true;
          lock.wx = authored;
        }
        if (lock.on) {
          // Too far from where the clip wants it: let the paw slide over, never pop.
          let local = ((lock.wx - d.worldX) * this.facing) / d.scale;
          if (Math.abs(local - foot.x) > 18) {
            lock.wx = lerp(lock.wx, authored, 0.35);
            local = ((lock.wx - d.worldX) * this.facing) / d.scale;
          }
          p.feet[i] = vec(lerp(foot.x, local, w), foot.y);
        }
      } else {
        lock.on = false;
      }
    }
  }

  /** If a planted leg can't reach the floor, lower the body until it can. */
  private ground(_d: OliveDrive) {
    const p = this.pose;
    if (this.air > 0.5) return;
    const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
    let need = 0;
    for (let i = 0; i < 4; i++) {
      const foot = p.feet[i]!;
      if (foot.y < -PAW_R - 0.5 || p.lock[i]! < 0.5) continue;
      let gap: number;
      if (i >= 2) {
        gap = len(sub(foot, f.shoulderJoint)) - (F_UPPER + F_LOWER) * 0.98;
      } else {
        const m = p.meta[i]!;
        const hock = sub(foot, mul(vec(Math.sin(m), Math.cos(m)), H_META));
        gap = len(sub(hock, f.hipJoint)) - (H_THIGH + H_SHIN) * 0.98;
      }
      need = Math.max(need, gap);
    }
    p.by += Math.min(need, 8) * (1 - this.air);
  }

  private steadyHead(dt: number) {
    const p = this.pose;
    const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
    const raw = this.headPlacement(p, f, 0).pos.y;
    this.headY = lerp(this.headY || raw, raw, 1 - Math.exp(-dt * 9));
    const amount = (this.wGallop * 0.7 + this.wTrot * 0.45) * (1 - this.air) * (1 - this.restW);
    this.headFix = clamp(this.headY - raw, -5, 5) * amount;
  }

  private updateTail(dt: number, t: number) {
    const p = this.pose;
    const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
    // Unwrap so the tail never swings the long way round.
    const raw = Math.atan2(-f.fwd.y, -f.fwd.x) + p.tailRaise;
    const b = this.lastBase + wrap(raw - this.lastBase);
    const turn = b - this.lastBase;
    this.lastBase = b;
    const wave = p.tailWave;
    for (let i = 0; i < TAIL_N; i++) {
      const q = i / (TAIL_N - 1);
      const target =
        b +
        p.tailCurl * smoothstep(0.08, 1, q) * 1.1 +
        Math.sin(t * (2.2 + wave * 7) - i * 0.6) * wave * 0.3 * q;
      let a = this.tailA[i]!;
      a = target + wrap(a - target);
      a += turn * (1 - q) * 0.6;
      let w = this.tailW[i]!;
      w += ((target - a) * lerp(150, 45, q) - w * lerp(18, 8, q)) * dt;
      w += -this.vy * 0.016 * q * (this.air > 0.5 ? 1 : 0);
      this.tailW[i] = w;
      this.tailA[i] = a + w * dt;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Compositing                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Paint this frame offscreen at the feet point in the context's current
   * world transform.
   */
  prepare(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
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

    // The turn squeezes her through the middle and flips her.
    const k = smooth(this.turnK);
    const fx = lerp(this.turnFrom, this.facing, k);
    const sx = (Math.sign(fx) || this.facing) * lerp(0.5, 1, Math.abs(fx));
    const turnSquash = 1 + 0.06 * (1 - Math.abs(fx));
    const sq = clamp(this.squash * 0.06, -0.14, 0.16);

    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.clearRect(0, 0, W, H);
    cc.setTransform(
      sx * s * (1 + sq * 0.6),
      0,
      0,
      s * (1 - sq) * turnSquash,
      ax + (px - ix),
      ay + (py - iy),
    );
    cc.lineJoin = "round";
    cc.lineCap = "round";
    this.paint(cc);

    // Silhouette outline: dilate the cat and tint it.
    const r = clamp(1.05 * s, 1.2, 3.6);
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

    // Rim light: the top edge, as if lit from the high windows.
    const dd = clamp(1.6 * s, 1.5, 5);
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = "source-over";
    rc.clearRect(0, 0, W, H);
    rc.drawImage(this.color, 0, 0);
    rc.globalCompositeOperation = "source-in";
    rc.fillStyle = C.rim;
    rc.fillRect(0, 0, W, H);
    rc.globalCompositeOperation = "destination-out";
    rc.drawImage(this.color, -dd * 0.35, dd);
    rc.globalCompositeOperation = "source-over";

    this.placed = { ox: ix - ax, oy: iy - ay };
    this.lastScale = s;
  }

  /** Draw the prepared frame: soft halo, outline, colour, rim light. */
  composite(ctx: CanvasRenderingContext2D, alpha = 1) {
    if (!this.placed || !this.color || !this.sil || !this.rimC) return;
    const { ox, oy } = this.placed;
    const s = this.lastScale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(12, 8, 20, 0.42)";
    ctx.shadowBlur = clamp(5 * s, 4, 18);
    ctx.shadowOffsetY = clamp(1.5 * s, 1, 4);
    ctx.drawImage(this.sil, ox, oy);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(this.color, ox, oy);
    ctx.globalAlpha = alpha * 0.5;
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

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, alpha = 1) {
    this.prepare(ctx, x, y, scale);
    this.composite(ctx, alpha);
  }

  private paint(ctx: CanvasRenderingContext2D) {
    const p = this.pose;
    const f = frameOf(p.bx, p.by, p.pitch, p.stretch);
    const head = this.headPlacement(p, f, this.headFix);
    const legs = this.solveLegs(p, f, head);
    const tail = this.tailPoints(f);
    const sitting = this.restW * (this.resting ? 1 : 0) > 0.5 && this.restMode !== "down";
    const sittingLow = sitting || (this.resting && this.restK > 0.6);
    const body = this.bodyPath(f, p.arch);

    this.drawLeg(ctx, legs[FH]!, true, false);
    this.drawLeg(ctx, legs[FF]!, true, true);
    if (!sittingLow) this.drawTail(ctx, tail);
    this.drawNeck(ctx, f, head);
    this.drawBody(ctx, body);
    this.drawLeg(ctx, legs[NH]!, false, false, body.path);
    if (sittingLow) this.drawTail(ctx, tail);
    const pawUp = p.face > 0.4;
    if (!pawUp) this.drawLeg(ctx, legs[NF]!, false, true, body.path);
    this.drawJawShadow(ctx, head);
    this.drawHead(ctx, head.pos, head.angle);
    this.drawBow(ctx, head);
    if (pawUp) this.drawLeg(ctx, legs[NF]!, false, true, body.path);
  }

  /** Where the head sits. */
  private headPlacement(p: Pose, f: Frame, fix: number) {
    const neckRoot = add(f.shoulder, add(mul(f.fwd, 4), mul(f.up, 4)));
    const angle = p.pitch * 0.45 + p.neck;
    const pos = add(add(neckRoot, rot(vec(12, -12), angle)), vec(0, fix));
    return { pos, angle: p.head + p.pitch * 0.25 };
  }

  private solveLegs(p: Pose, f: Frame, head: { pos: V; angle: number }): Leg[] {
    const out: Leg[] = [];
    for (let i = 0; i < 4; i++) {
      const front = i >= 2;
      const far = i === FH || i === FF;
      const shift = far ? add(mul(f.fwd, 2.5), mul(f.up, 1.5)) : vec(0, 0);
      let target = p.feet[i]!;
      if (i === NF && p.face > 0) {
        const spot = add(head.pos, rot(vec(p.faceX, p.faceY), head.angle));
        target = lerpV(target, spot, p.face);
      }
      if (front) {
        const root = add(f.shoulderJoint, shift);
        const s = ik(root, target, F_UPPER, F_LOWER, 1);
        const pawAngle = p.paw[i]! + (i === NF ? p.face * -1.2 : 0);
        out.push({ pts: [root, s.mid, s.end], paw: s.end, pawAngle });
      } else {
        const root = add(f.hipJoint, shift);
        const m = p.meta[i]!;
        const dir = vec(Math.sin(m), Math.cos(m));
        const s = ik(root, sub(target, mul(dir, H_META)), H_THIGH, H_SHIN, -1);
        const paw = add(s.end, mul(dir, H_META));
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
    // Back: rump, loin, a dip, then the shoulder blades.
    const top = (u: number) =>
      keyed(
        u,
        [
          [0, 9.5],
          [0.08, 10.8],
          [0.3, 9.2],
          [0.55, 8.2],
          [0.85, 9.8],
          [1, 9.2],
        ],
        false,
      );
    // Underline: thigh, a tucked flank, the belly, and a deep chest.
    const bot = (u: number) =>
      keyed(
        u,
        [
          [0, 12],
          [0.22, 9.2],
          [0.45, 11.4],
          [0.7, 15.8],
          [0.88, 18.4],
          [1, 15.5],
        ],
        false,
      );
    const pts: V[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const s = spine(u);
      pts.push(add(s.p, mul(s.n, top(u))));
    }
    // Chest: round forward and down into a fluffy bib.
    const s1 = spine(1);
    for (let i = 1; i < 9; i++) {
      const a = (i / 9) * Math.PI;
      const fluff = i > 3 && i < 8 ? (i % 2 ? 1.4 : -0.3) : 0;
      const r = lerp(top(1), bot(1), (1 - Math.cos(a)) / 2) + 7.5 * Math.sin(a) + fluff;
      pts.push(add(s1.p, add(mul(s1.n, Math.cos(a) * r), mul(s1.t, Math.sin(a) * r * 0.78))));
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N;
      const s = spine(u);
      const fluff = i > 3 && i < 10 ? (i % 2 ? 0.8 : -0.3) : 0;
      pts.push(add(s.p, mul(s.n, -bot(u) - fluff)));
    }
    // Rump.
    const s0 = spine(0);
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const r = lerp(bot(0), top(0), (1 - Math.cos(a)) / 2) + 4 * Math.sin(a);
      pts.push(add(s0.p, add(mul(s0.n, -Math.cos(a) * r), mul(s0.t, -Math.sin(a) * r * 0.9))));
    }
    return { path: smoothClosed(pts), spine };
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
    this.furTexture(ctx, path, 0.26);

    // Dark saddle along the spine, darkest over the shoulders.
    ctx.strokeStyle = C.stripe;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const s = spine(i / 12);
      const q = add(s.p, mul(s.n, 8.4));
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    const sh = spine(0.86);
    ctx.fillStyle = C.stripe;
    ctx.beginPath();
    ctx.ellipse(sh.p.x, sh.p.y + 1, 9, 11, Math.atan2(sh.t.y, sh.t.x), 0, TAU);
    ctx.fill();

    // Mackerel stripes: thin, wavy, tapering down the flank.
    ctx.globalAlpha = 0.66;
    const stripes = [0.03, 0.12, 0.21, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    stripes.forEach((u, i) => {
      const s = spine(u);
      const depth = 7 + (i % 3) * 2.6;
      const wob = (i % 2 ? 1 : -1) * 1.5;
      const w = 1.1 + (i % 2) * 0.3;
      const a = add(s.p, mul(s.n, 9.6));
      const m = add(s.p, mul(s.t, wob));
      const b = add(add(s.p, mul(s.n, -depth)), mul(s.t, -wob * 0.6 - 1.4));
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
      if (i % 2 === 0) {
        const c = add(add(s.p, mul(s.n, -depth - 3.2)), mul(s.t, -2));
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 0.8, 1.7, Math.atan2(s.n.y, s.n.x), 0, TAU);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // White chest, belly, and the splash on the flank.
    ctx.fillStyle = C.white;
    ctx.beginPath();
    const edge: V[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const s = spine(u);
      const off = lerp(-11.5, -0.5, smoothstep(0.42, 1, u)) + Math.sin(u * 23) * 0.6;
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
    const sp = spine(0.38);
    const splash = add(sp.p, mul(sp.n, -8));
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
    shade.addColorStop(0.66, "rgba(60, 50, 90, 0)");
    shade.addColorStop(1, "rgba(60, 50, 90, 0.34)");
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

  /** A smooth outline around a chain of points with half-widths. */
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
    const j = leg.pts;
    // Densify the chain so muscles can swell between joints.
    let pts: V[];
    let hw: number[];
    if (front) {
      pts = [
        j[0]!,
        lerpV(j[0]!, j[1]!, 0.5),
        j[1]!,
        lerpV(j[1]!, j[2]!, 0.35),
        lerpV(j[1]!, j[2]!, 0.75),
        j[2]!,
      ];
      hw = [7, 6.3, 4.6, 3.8, 3.2, 3.1];
    } else {
      pts = [
        j[0]!,
        lerpV(j[0]!, j[1]!, 0.45),
        j[1]!,
        lerpV(j[1]!, j[2]!, 0.5),
        j[2]!,
        lerpV(j[2]!, j[3]!, 0.5),
        j[3]!,
      ];
      // The heel juts out at the hock.
      hw = [10.5, 9.4, 5.4, 3.6, 3.9, 2.9, 2.8];
    }
    const path = this.limbPath(pts, hw);
    const pawC = add(leg.paw, rot(vec(1.7, 0.1), leg.pawAngle));
    const paw = new Path2D();
    paw.ellipse(pawC.x, pawC.y, PAW_R + 1.8, PAW_R, leg.pawAngle, 0, TAU);

    ctx.save();
    ctx.clip(path);
    if (front) {
      ctx.fillStyle = C.white;
      ctx.fill(path);
      // A soft shadow where the upper arm tucks against the chest.
      const g = ctx.createLinearGradient(j[0]!.x, j[0]!.y, j[1]!.x, j[1]!.y);
      g.addColorStop(0, "rgba(70, 62, 104, 0.3)");
      g.addColorStop(1, "rgba(70, 62, 104, 0)");
      ctx.fillStyle = g;
      ctx.fill(path);
    } else {
      // Haunch light and stripes curving round the thigh.
      const hc = lerpV(j[0]!, j[1]!, 0.45);
      const g = ctx.createLinearGradient(hc.x, hc.y - 12, hc.x + 4, hc.y + 12);
      g.addColorStop(0, C.tabbyLight);
      g.addColorStop(0.5, C.tabby);
      g.addColorStop(1, C.tabbyDark);
      ctx.fillStyle = g;
      ctx.fill(path);
      this.furTexture(ctx, path, 0.22);
      ctx.strokeStyle = C.stripe;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      const along = norm(sub(j[1]!, j[0]!));
      const across = vec(-along.y, along.x);
      for (let k = 0; k < 3; k++) {
        const c = add(lerpV(j[0]!, j[1]!, 0.2 + k * 0.27), mul(across, 2));
        ctx.beginPath();
        ctx.moveTo(c.x - across.x * 10, c.y - across.y * 10);
        ctx.quadraticCurveTo(
          c.x + along.x * 3.5,
          c.y + along.y * 3.5,
          c.x + across.x * 10,
          c.y + across.y * 10,
        );
        ctx.stroke();
      }
      for (const q of [0.35, 0.7]) {
        const c = lerpV(j[1]!, j[2]!, q);
        const dir = norm(sub(j[2]!, j[1]!));
        const nn = vec(-dir.y, dir.x);
        line(ctx, add(c, mul(nn, 4)), add(c, mul(nn, -4)));
      }
      ctx.globalAlpha = 1;
      // White sock from just above the hock down.
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 8.5;
      line(ctx, lerpV(j[1]!, j[2]!, 0.82), j[3]!);
    }
    // Round the leg: light on the front edge, shade down the back.
    const a = j[front ? 1 : 2]!;
    const b = j[j.length - 1]!;
    const dir = norm(sub(b, a));
    const nb = vec(-dir.y, dir.x);
    const mid = lerpV(a, b, 0.5);
    const cyl = ctx.createLinearGradient(
      mid.x + nb.x * 5,
      mid.y + nb.y * 5,
      mid.x - nb.x * 5,
      mid.y - nb.y * 5,
    );
    cyl.addColorStop(0, "rgba(70, 62, 104, 0.34)");
    cyl.addColorStop(0.45, "rgba(70, 62, 104, 0)");
    cyl.addColorStop(0.8, "rgba(255, 244, 222, 0)");
    cyl.addColorStop(1, "rgba(255, 244, 222, 0.25)");
    ctx.fillStyle = cyl;
    ctx.fill(path);
    ctx.restore();

    // Paw with a hint of toes.
    ctx.fillStyle = C.white;
    ctx.fill(paw);
    ctx.save();
    ctx.clip(paw);
    ctx.fillStyle = C.shade;
    ctx.beginPath();
    ctx.ellipse(pawC.x, pawC.y + PAW_R * 0.95, PAW_R + 2, PAW_R * 0.7, leg.pawAngle, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(86, 78, 118, 0.4)";
    ctx.lineWidth = 0.5;
    for (const dx of [1.2, 3.2]) {
      const p0 = add(pawC, rot(vec(dx, -PAW_R * 0.9), leg.pawAngle));
      const p1 = add(pawC, rot(vec(dx + 0.3, -PAW_R * 0.2), leg.pawAngle));
      line(ctx, p0, p1);
    }
    ctx.restore();

    // Edge lines only where the leg is outside the body, so white on white still reads.
    ctx.save();
    if (body) {
      const outside = new Path2D();
      outside.rect(-500, -500, 1000, 1000);
      outside.addPath(body);
      ctx.clip(outside, "evenodd");
    }
    ctx.strokeStyle = front ? "rgba(74, 64, 96, 0.55)" : C.inner;
    ctx.lineWidth = 0.9;
    ctx.stroke(path);
    ctx.stroke(paw);
    ctx.restore();
    if (!front && !far) {
      // A faint crease where the haunch meets the flank.
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = "rgba(42, 32, 26, 0.24)";
      ctx.lineWidth = 1;
      ctx.stroke(path);
      ctx.restore();
    }
    if (far) {
      // Far legs sit in Olive's own shadow.
      ctx.fillStyle = "rgba(34, 26, 46, 0.28)";
      ctx.fill(path);
      ctx.fill(paw);
    }
  }

  private tailPoints(f: Frame): V[] {
    const b = add(f.hip, add(mul(f.fwd, -9), mul(f.up, 5)));
    const pts: V[] = [b];
    let cur = b;
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
    const hw = pts.map((_, i) => lerp(4.1, 3.3, i / (pts.length - 1)) + (i % 2 ? 0.25 : -0.1));
    const tip = pts[pts.length - 1]!;
    const dir = norm(sub(tip, pts[pts.length - 2]!));
    const path = this.limbPath([...pts, add(tip, mul(dir, 2.8))], [...hw, 1.7]);
    ctx.save();
    ctx.fillStyle = C.tabby;
    ctx.fill(path);
    ctx.clip(path);
    this.furTexture(ctx, path, 0.24);
    // Rings, then the dark tip.
    ctx.strokeStyle = C.stripe;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.78;
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
    const mid = pts[Math.floor(pts.length / 2)]!;
    const g = ctx.createLinearGradient(mid.x, mid.y - 6, mid.x, mid.y + 6);
    g.addColorStop(0, "rgba(255, 236, 200, 0.2)");
    g.addColorStop(1, "rgba(40, 30, 60, 0.22)");
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();
  }

  private drawNeck(ctx: CanvasRenderingContext2D, f: Frame, head: { pos: V }) {
    // A thick neck bridging chest and head: tabby nape, white throat.
    const a = add(f.shoulder, mul(f.up, 2));
    const b = head.pos;
    ctx.strokeStyle = C.tabby;
    ctx.lineWidth = 20;
    line(ctx, a, b);
    const down = mul(f.up, -1);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 14;
    line(ctx, add(add(a, mul(down, 6)), mul(f.fwd, 4)), add(add(b, mul(down, 6)), mul(f.fwd, 2)));
    ctx.save();
    ctx.strokeStyle = C.stripe;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    const dd = norm(sub(b, a));
    const n = vec(dd.y, -dd.x);
    for (const q of [0.3, 0.6]) {
      const c = lerpV(a, b, q);
      line(ctx, add(c, mul(n, 9.5)), add(c, mul(n, 3)));
    }
    ctx.restore();
  }

  private drawJawShadow(ctx: CanvasRenderingContext2D, head: { pos: V; angle: number }) {
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
    const p = this.pose;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.scale(0.96, 0.96);

    const earBack = clamp(p.ears + this.earLag, -0.3, 1.2);
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
    ctx.strokeStyle = C.inner;
    ctx.lineWidth = 0.8;
    ctx.stroke(head);

    const lids = clamp(p.eyes, 0, 1);
    this.drawEye(ctx, -2.6, -4.2, 5.4, 5, -0.12, false, lids);
    this.drawEye(ctx, 12.7, -4.8, 3.9, 4.7, 0.12, true, lids);

    this.drawMouth(ctx, p.mouth, p.tongue);

    // Nose.
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

    // Whiskers, drifting a little and swept back at speed.
    const sweep = this.wGallop * 2 + this.air * 1.5;
    const sway = Math.sin(t * 1.7) * 0.6 + sweep;
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

  private drawMouth(ctx: CanvasRenderingContext2D, open: number, tongue: number) {
    if (open > 0.04) {
      // A wide yawn or a bite: dark mouth, pink tongue, two little fangs.
      const w = 3.4 + open * 2.2;
      const h = 1 + open * 7;
      ctx.fillStyle = C.mouth;
      ctx.beginPath();
      ctx.ellipse(16.4, 7.4 + h * 0.45, w, h * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.tongue;
      ctx.beginPath();
      ctx.ellipse(16.4, 7.4 + h * 0.75, w * 0.7, h * 0.28, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      for (const x of [14.2, 18.6]) {
        ctx.beginPath();
        ctx.moveTo(x - 0.7, 7.6);
        ctx.lineTo(x + 0.7, 7.6);
        ctx.lineTo(x, 9 + open * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = "#8d6a62";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(17.5, 5);
      ctx.lineTo(17.4, 7);
      ctx.quadraticCurveTo(15.6, 9.2, 13.4, 8.2);
      ctx.moveTo(17.4, 7);
      ctx.quadraticCurveTo(19, 8.8, 20.6, 7.8);
      ctx.stroke();
    }
    if (tongue > 0.05) {
      ctx.fillStyle = C.tongue;
      ctx.strokeStyle = "#c45d6b";
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(17.6, 8.6 + tongue * 1.6, 1.6, 1 + tongue * 1.6, 0.2, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
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
    const b = near ? vec(-6.5, -12.5) : vec(10.5, -13);
    const spin = (near ? -0.2 : 0.16) - back * 0.95 - twitch * 0.35 * Math.sin(t * 40);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(spin);
    ctx.scale(1, 1 - clamp(back, 0, 1) * 0.3);
    const w = near ? 9.8 : 7.8;
    const h = near ? 16.5 : 15.5;
    const lean = near ? -2 : 2.5;
    const ear = new Path2D();
    ear.moveTo(-w, 4);
    ear.bezierCurveTo(-w + 1, -h * 0.4, lean - 2.5, -h + 1, lean, -h);
    ear.bezierCurveTo(lean + 2.5, -h + 1.5, w - 1, -h * 0.4, w, 4.5);
    ear.closePath();
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
    lids: number,
  ) {
    const blink = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    const open = clamp(lids - blink * 1.05 - (this.resting ? 0.1 : 0), 0, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
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
      // Closed or closing: a soft curved lid line, smiling when content.
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
    const knot = add(head.pos, rot(vec(5, 16), a));
    ctx.save();
    ctx.translate(knot.x, knot.y);
    ctx.rotate(a + Math.sin(this.bowFlap * 0.5) * 0.04);
    ctx.scale(1.3, 1.3);
    ctx.strokeStyle = C.navyEdge;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-11.5, -5.5);
    ctx.quadraticCurveTo(-6, 1.2, 3.5, 0.4);
    ctx.stroke();
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // The bell swings on its ring.
    ctx.save();
    ctx.translate(-3, 1.2);
    ctx.rotate(this.bell - a * 0.6);
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

    // A larger back bow with a smaller one layered on top, then the knot.
    const flap = 1 + Math.sin(this.bowFlap) * (0.03 + this.air * 0.08 + this.wGallop * 0.05);
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
