# The Cat Castle

Climb the atrium as Olive, a green-eyed tabby-and-white cat in a navy polka-dot bowtie. Run the cushions, leap the gap, glide down to set the landing, and take the salmon at the top.

**Play in the browser:** [https://mecca-research.github.io/The-Cat-Castle-Platformer/](https://mecca-research.github.io/The-Cat-Castle-Platformer/)

That address used to open Dwarf Lord, because the user site’s missing-page file sends every unknown path there. The game is published at this path now.

If this repository’s Pages setting still says it is disabled, choose **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**, then save. The playable site is already on that branch.

## Controls

| Key | Action |
| --- | --- |
| A / D or arrows | Move |
| Shift, X, or B | Run |
| Space, W, Up, or Z | Jump. Hold it to jump higher, keep holding on the way down to glide |
| S or Down | Drop through a cushion; in the air, dive |

On a phone, use the on-screen pad. Holding the feather button glides.

A running jump from the back half of the cushion makes the crossing. A walking hop or a tap does not. The glide stretches a jump that would fall short, and the ring over Olive’s back shows how much glide is left. It refills when she lands. The soft shadow below her marks where she will land.

The jump forgives a press made just before landing or just after running off the edge. Letting go of Jump early cuts the jump short.

## How it’s drawn

There are no sprite sheets. Everything is drawn in code on a canvas:

- **Olive** (`src/game/olive.ts`) is a vector rig: a spline body, IK legs, a spring-driven tail and a three-quarter head. Her pose blends from the physics every frame, so she walks, gallops, leaps, glides, dives, skids, lands and sits down when left alone. She is painted offscreen, then given one clean outline, a soft halo and a rim of window light.
- **The atrium** (`src/game/scene.ts`, `src/game/art.ts`) is built from parallax layers. Behind the trees are a sunlit far hall seen through arcaded galleries, a rose window and coffered dome at the crown, drapes and chandeliers, and light shafts. In front are dust motes and out-of-focus columns. The back layers are baked for the current screen and blurred for depth of field.
- **Movement** (`src/game/physics.ts`) is a pure step function with unit tests in `src/game/physics.test.ts`.

## Local

```bash
npm install
npm run dev
npm test
```

The static site used by GitHub Pages is built with:

```bash
npx vite build --config vite.pages.config.ts
```
