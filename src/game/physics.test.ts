import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FLOOR_Y, LEFT_X, PERCH_W, PERCHES } from "./level.ts";
import { makePlayer, NO_INPUT, stepPlayer, TUNING, type Input } from "./physics.ts";

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

describe("the original run and jump", () => {
  it("a held run-jump near the lip reaches the next perch", () => {
    for (const jumpAt of [LIP - 120, LIP - 40, LIP - 2]) {
      assert.equal(runJump({ run: true, jumpAt, hold: 999 })?.index, 1, `jump at ${jumpAt}`);
    }
  });

  it("a tap, or a walking jump from mid-cushion, falls short", () => {
    assert.notEqual(runJump({ run: true, jumpAt: LIP - 10, hold: 3 })?.index, 1);
    assert.notEqual(runJump({ run: false, jumpAt: LIP - 110, hold: 999 })?.index, 1);
  });

  it("holding Jump goes higher than tapping it", () => {
    assert.ok(apexOf(2) < apexOf(999));
    assert.ok(apexOf(999) > 165, "a held jump clears one storey of perches");
  });

  it("allows a jump for a few frames after running off the edge", () => {
    const p = makePlayer();
    while (p.grounded) stepPlayer(p, press({ right: true }));
    for (let i = 0; i < TUNING.coyote - 2; i++) stepPlayer(p, press({ right: true }));
    assert.ok(stepPlayer(p, press({ right: true, jump: true })).jumped);
  });

  it("does not jump again until Jump is let go", () => {
    const p = makePlayer();
    assert.ok(stepPlayer(p, press({ jump: true })).jumped);
    let again = false;
    for (let f = 0; f < 200; f++) again ||= stepPlayer(p, press({ jump: true })).jumped;
    assert.equal(again, false);
  });

  it("drops through a perch with Down but not through the floor", () => {
    const p = makePlayer();
    stepPlayer(p, NO_INPUT);
    assert.ok(stepPlayer(p, press({ down: true })).dropped);
    let landedOn = null;
    for (let f = 0; f < 200 && !landedOn; f++) landedOn = stepPlayer(p, NO_INPUT).landedOn;
    assert.equal(landedOn?.kind, "floor");
    stepPlayer(p, NO_INPUT);
    assert.equal(stepPlayer(p, press({ down: true })).dropped, false);
    assert.equal(p.y + p.h, FLOOR_Y);
  });

  it("reports a landing once, with the fall speed", () => {
    const p = makePlayer();
    p.y = PERCHES[0]!.y - 200;
    p.grounded = false;
    let landings = 0;
    let impact = 0;
    for (let f = 0; f < 120; f++) {
      const ev = stepPlayer(p, NO_INPUT);
      if (ev.landed) {
        landings++;
        impact = ev.landed;
      }
    }
    assert.equal(landings, 1);
    assert.ok(impact > 5);
  });
});
