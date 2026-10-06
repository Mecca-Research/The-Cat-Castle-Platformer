import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FLOOR_Y, LEFT_X, PERCH_W, PERCHES } from "./level.ts";
import { makePlayer, NO_INPUT, stepPlayer, TUNING, type Input, type Player } from "./physics.ts";

const LIP = LEFT_X + PERCH_W;

function press(over: Partial<Input>): Input {
  return { ...NO_INPUT, ...over };
}

/** Run right from the start and jump once Olive's left edge passes `jumpAt`. */
function runJump(opts: { run: boolean; jumpAt: number; hold: number }) {
  const p = makePlayer();
  let jumpFrame = -1;
  for (let f = 0; f < 400; f++) {
    if (jumpFrame < 0 && p.x >= opts.jumpAt) jumpFrame = f;
    const jump = jumpFrame >= 0 && f - jumpFrame < opts.hold;
    const ev = stepPlayer(p, press({ right: true, run: opts.run, jump }));
    if (jumpFrame >= 0 && ev.landed) return ev.landedOn;
  }
  return null;
}

/** Olive in open air between the trees, with no late-jump frames left. */
function airborne(y: number, vy: number): Player {
  const p = makePlayer();
  p.x = LIP + 40;
  p.y = y;
  p.vy = vy;
  p.grounded = false;
  p.ground = null;
  p.coyote = 0;
  return p;
}

function apexOf(hold: number) {
  const p = makePlayer();
  const startY = p.y;
  let top = p.y;
  for (let f = 0; f < 200; f++) {
    const ev = stepPlayer(p, press({ jump: f < hold }));
    top = Math.min(top, p.y);
    if (f > 0 && ev.landed) break;
  }
  return startY - top;
}

describe("crossing between the trees", () => {
  it("a held run-jump from the back half of the cushion reaches the next perch", () => {
    for (const jumpAt of [LEFT_X + PERCH_W * 0.55, LIP - 40, LIP - 2]) {
      assert.equal(runJump({ run: true, jumpAt, hold: 999 })?.index, 1, `jump at ${jumpAt}`);
    }
  });

  it("a tap or a walking hop falls short", () => {
    assert.notEqual(runJump({ run: true, jumpAt: LIP - 10, hold: 4 })?.index, 1);
    assert.notEqual(runJump({ run: false, jumpAt: LIP - 60, hold: 999 })?.index, 1);
  });

  it("gliding stretches a run-jump that would otherwise fall short", () => {
    const early = LIP - 160;
    assert.notEqual(runJump({ run: true, jumpAt: early, hold: 30 })?.index, 1);
    assert.equal(runJump({ run: true, jumpAt: early, hold: 999 })?.index, 1);
  });
});

describe("jump feel", () => {
  it("holding Jump goes higher than tapping it", () => {
    const tap = apexOf(2);
    const held = apexOf(999);
    assert.ok(tap < 50, `tap rose ${tap}`);
    assert.ok(held > 150, `hold rose ${held}`);
  });

  it("buffers a press made just before touchdown", () => {
    const p = makePlayer();
    stepPlayer(p, press({ jump: true }));
    let f = 0;
    // Fall until a few frames above the cushion, then tap Jump in the air.
    while (!(p.vy > 0 && PERCHES[0]!.y - (p.y + p.h) < p.vy * 4) && f++ < 200) {
      stepPlayer(p, NO_INPUT);
    }
    assert.equal(p.grounded, false);
    stepPlayer(p, press({ jump: true }));
    let jumpedAgain = false;
    for (let i = 0; i < TUNING.buffer + 2 && !jumpedAgain; i++) {
      jumpedAgain = stepPlayer(p, press({ jump: true })).jumped;
    }
    assert.ok(jumpedAgain, "the early press should fire on landing");
  });

  it("allows a late jump just after running off the edge", () => {
    const p = makePlayer();
    let left = -1;
    for (let f = 0; f < 200; f++) {
      stepPlayer(p, press({ right: true }));
      if (!p.grounded) {
        left = f;
        break;
      }
    }
    assert.ok(left > 0, "Olive should walk off the end of the cushion");
    stepPlayer(p, press({ right: true }));
    stepPlayer(p, press({ right: true }));
    const ev = stepPlayer(p, press({ right: true, jump: true }));
    assert.ok(ev.jumped, "coyote time should still allow the jump");
  });

  it("stops quickly when the direction is let go", () => {
    const p: Player = makePlayer();
    p.x = LEFT_X + 10;
    for (let f = 0; f < 22; f++) stepPlayer(p, press({ right: true, run: true }));
    assert.ok(p.vx > TUNING.walk, "should be running");
    const from = p.x;
    let frames = 0;
    while (p.vx > 0 && frames < 30) {
      stepPlayer(p, NO_INPUT);
      frames++;
    }
    assert.ok(frames <= 9, `stopped in ${frames} frames`);
    assert.ok(p.x - from < 45, `slid ${p.x - from}px`);
  });
});

describe("glide", () => {
  it("caps the fall while Jump is held and runs out of stamina", () => {
    const p = airborne(FLOOR_Y - 900, 6);
    let started = false;
    let tired = false;
    let maxGlideVy = 0;
    for (let f = 0; f < 120; f++) {
      const ev = stepPlayer(p, press({ jump: true }));
      started ||= ev.glideStart;
      tired ||= ev.tired;
      if (p.gliding && f > 12) maxGlideVy = Math.max(maxGlideVy, p.vy);
    }
    assert.ok(started, "glide should deploy");
    assert.ok(
      maxGlideVy <= TUNING.glideFall + TUNING.glideSink + 0.01,
      `glide fell at ${maxGlideVy}`,
    );
    assert.ok(tired, "glide should run out");
  });

  it("Down dives instead of gliding", () => {
    const p = airborne(FLOOR_Y - 900, 2);
    for (let f = 0; f < 30; f++) stepPlayer(p, press({ jump: true, down: true }));
    assert.equal(p.gliding, false);
    assert.ok(p.vy > TUNING.maxFall, `dive speed ${p.vy}`);
  });

  it("refills on landing", () => {
    const p = airborne(PERCHES[0]!.y - 200, 3);
    p.x = LEFT_X + 60;
    let landed = false;
    for (let f = 0; f < 400 && !landed; f++)
      landed = stepPlayer(p, press({ jump: true })).landed > 0;
    assert.ok(landed);
    assert.equal(p.stamina, TUNING.glideStamina);
  });
});

describe("cushions", () => {
  it("Down drops through a perch but not the floor", () => {
    const p = makePlayer();
    stepPlayer(p, NO_INPUT);
    const ev = stepPlayer(p, press({ down: true }));
    assert.ok(ev.dropped);
    let landedOn = null;
    for (let f = 0; f < 200 && !landedOn; f++) landedOn = stepPlayer(p, NO_INPUT).landedOn;
    assert.equal(landedOn?.kind, "floor");
    assert.equal(stepPlayer(p, press({ down: true })).dropped, false);
  });
});
