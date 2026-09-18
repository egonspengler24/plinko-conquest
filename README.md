# Plinko Conquest

A browser game where 24 colours fight over a 6×4 board of small squares. Each colour has a ball on a plinko board and a spinning cannon. The last colour with any squares wins.

No build step and no dependencies to install: it's plain HTML, CSS and JavaScript, with [Matter.js](https://brm.io/matter-js/) vendored for the physics.

## How it plays

- Every colour starts with a 20×20 block of squares and a cannon that spins at a constant rate. The number under the cannon starts at **1**.
- Each colour has one ball on the plinko board (right). When a ball reaches the bottom it lands on:
  - **x2** (left half): doubles that colour's number (1 → 2 → 4 → 8 → 16 …)
  - **R** (right half): **releases** the cannon. It fires that many shots in whatever direction the barrel is pointing as it spins, then the number resets to 1. While it's firing, the number shows the shots remaining in pink.
- The ball is then dropped back in at the top.
- A shot flies in a straight line (bouncing off the outer walls) until it hits a square that isn't its own colour, then paints a ragged blob of squares in its colour.
- A colour with no squares left is eliminated and its ball leaves the board. Last colour standing wins.
- **Escalation:** after 30 seconds the blob size grows steadily, so the endgame between two evenly matched colours always finishes.

## Setting up a game

- Type a name into each of the 24 coloured fields (or use *Paste a list of names*). Blank fields fall back to the colour name. Names are remembered in your browser.
- *Choose audio file* to add a music track. The file is played locally and never uploaded.
- Controls in game: pause (Space), 1×/2×/4×/8× speed, sound on/off and volume, fullscreen.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tuning

Game balance lives at the top of [`js/board.js`](js/board.js) (`BOARD_CFG`): cannon spin rate, shot speed, blob size, and how quickly the escalation kicks in. The plinko layout is in [`js/pegboard.js`](js/pegboard.js) (`PEG_CFG`), and the colours in [`js/teams.js`](js/teams.js).

`js/board.js` has no DOM access, so the game rules can be simulated headlessly with Node.

## Deploying

The site is static. On GitHub, go to *Settings → Pages* and serve from the `main` branch, root folder.
