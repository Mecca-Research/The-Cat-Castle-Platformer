# The Cat Castle

Climb the atrium as Olive. Run the cushions, jump the gap, and take the salmon at the top.

**Play in the browser:** [https://mecca-research.github.io/The-Cat-Castle-Platformer/](https://mecca-research.github.io/The-Cat-Castle-Platformer/)

The play link goes live after Pages is switched on once: open [Settings → Pages](https://github.com/Mecca-Research/The-Cat-Castle-Platformer/settings/pages) and set **Source** to **GitHub Actions**. Pushes to `main` then publish the game.

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
