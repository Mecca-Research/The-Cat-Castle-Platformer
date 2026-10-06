export type Side = "left" | "right";

export type Platform = {
  x: number;
  y: number;
  w: number;
  /** Solid ground can't be dropped through. Perches are one-way. */
  solid: boolean;
  kind: "floor" | "perch";
  side: Side;
  /** Perch number counted from the bottom; -1 for the floor. */
  index: number;
};

export const WORLD_H = 2400;
export const FLOOR_Y = 2160;
export const PERCH_W = 250;
export const GAP = 220;
export const MARGIN = 160;
export const LEFT_X = MARGIN;
export const RIGHT_X = LEFT_X + PERCH_W + GAP;
export const WORLD_W = RIGHT_X + PERCH_W + MARGIN;
export const RISE = 165;
export const FIRST = 152;
export const COUNT = 9;

function buildPlatforms(): Platform[] {
  const list: Platform[] = [
    { x: 0, y: FLOOR_Y, w: WORLD_W, solid: true, kind: "floor", side: "left", index: -1 },
  ];
  for (let i = 0; i < COUNT; i++) {
    const side: Side = i % 2 === 0 ? "left" : "right";
    list.push({
      x: side === "left" ? LEFT_X : RIGHT_X,
      y: FLOOR_Y - FIRST - i * RISE,
      w: PERCH_W,
      solid: false,
      kind: "perch",
      side,
      index: i,
    });
  }
  return list;
}

export const PLATFORMS: readonly Platform[] = buildPlatforms();
export const PERCHES: readonly Platform[] = PLATFORMS.filter((p) => p.kind === "perch");
export const SUMMIT: Platform = PERCHES[PERCHES.length - 1]!;

/** Where the salmon sits on the crown perch. */
export const GOAL = { x: SUMMIT.x + SUMMIT.w * 0.62, y: SUMMIT.y - 30 };
