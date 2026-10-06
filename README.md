# The Cat Castle

Climb the atrium as Olive, a green-eyed tabby-and-white cat in a navy polka-dot bowtie. Run the cushions, jump the gap, and take the salmon at the top.

**Play in the browser:** [https://mecca-research.github.io/The-Cat-Castle-Platformer/](https://mecca-research.github.io/The-Cat-Castle-Platformer/)

That address used to open Dwarf Lord, because the user site’s missing-page file sends every unknown path there. The game is published at this path now.

If this repository’s Pages setting still says it is disabled, choose **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**, then save. The playable site is already on that branch.

## Controls

| Key | Action |
| --- | --- |
| A / D or arrows | Move |
| Shift, X, or B | Run |
| Space, W, or Up | Jump (hold it) |
| S or Down | Drop through a cushion |

On a phone, use the Run and Jump buttons.

Get a full run along the cushion, jump at the inner lip, and steer on the way down. A walk or a tap falls short. Let go of Run when you land so Olive does not slide off the shelf.

## How it's drawn

There are no sprite sheets. Everything is drawn in code on a canvas:

- **Olive** (`src/game/olive.ts`) is a vector rig animated from hand-keyed clips: idle, walk, trot and gallop (all three locked to one stride phase, with planted paws pinned to the floor so they never slide), a skid when she reverses, a running leap or a tucked hop depending on her speed, a landing crouch, and a quick turn-around. Left alone she sits down, then grooms or yawns now and then. At the top she trots to the salmon and eats it. Her tail, ears and collar bell swing on springs, and her head holds steady through the gallop.
- **The atrium** (`src/game/scene.ts`, `src/game/art.ts`) is built from parallax layers. Behind the trees are a sunlit far hall seen through arcaded galleries, a rose window and coffered dome at the crown, drapes and chandeliers that sway, and light shafts. In front are dust motes and out-of-focus columns. The back layers are baked for the current screen and blurred for depth of field.
- **Movement** (`src/game/physics.ts`) is the original run and jump, kept as a pure step function with tests in `src/game/physics.test.ts`.

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
