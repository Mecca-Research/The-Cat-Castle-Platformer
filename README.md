# The Cat Castle

Climb the atrium as Olive. Run the cushions, jump the gap, and take the salmon at the top.

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

## Local

```bash
npm install
npm run dev
```

The static site used by GitHub Pages is built with:

```bash
npx vite build --config vite.pages.config.ts
```
