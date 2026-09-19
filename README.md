# Plinko Conquest

A browser game where 24 colours fight over a 6×4 board of small squares. Each colour has a ball on a plinko board and a spinning cannon. The last colour with any squares wins.

No build step and no dependencies to install: it's plain HTML, CSS and JavaScript, with [Matter.js](https://brm.io/matter-js/) vendored for the physics.

## How it plays

- There is one cannon per colour, on the middle square of each starting block. Every cannon has its own plinko ball and its own number, which starts at **1**. All cannons spin together, clockwise, at the same constant rate (one turn about every 3 seconds).
- Each ball drops down the plinko board (right). When it reaches the bottom it lands on:
  - **x2** (left half): doubles that cannon's number (1 → 2 → 4 → 8 → 16 …)
  - **R** (right half): **releases** the cannon. It fires that many shots in whatever direction the barrel is pointing at that moment, then the number resets to 1. While it's firing, the number shows the shots remaining in pink.
- The ball is then dropped back in at the top. Half-circle bumpers on the side walls stop balls sliding straight down the edges.
- **Each shot takes exactly one square.** It flies in a straight line (slowly enough to watch) and captures the first square it meets that isn't its own colour. So a stack of 8 takes 8 squares, in a short line along the barrel direction.
- **The board wraps around.** A shot that leaves the right edge comes back in from the left (and likewise top and bottom), so colours in the middle are no more exposed to fire than colours on the edge. In 4,000 simulated games every starting position won about equally often.
- **Capturing a cannon:** a cannon belongs to whichever colour owns the square underneath it. If a shot captures that square, the cannon, its ball and its built-up number all switch to the capturing colour. Cannons are never removed; they keep circling and firing for their new owner, so a colour with more cannons has more firepower. A white ring marks a cannon (and ball) that has changed hands.
- A colour with no squares left is out. The last colour standing wins.

## Setting up a game

- **Board size:** 6×4 (24 colours, the default), 4×3 (12 colours) or 3×2 (6 colours). Every colour's block holds about 13×13 small squares (4×3 uses 13×12), so a 6×4 board is 78×52 squares. On the smaller boards the squares and cannons are drawn bigger, and games last about the same time.
- **Names and colours:** type a name into each coloured field (or use *Paste a list of names*). Blank fields fall back to the colour name. Click a field's colour chip to change its colour: there are 26 to choose from, each usable once (picking one that's taken swaps the two). **Rainbow** cycles through the hues every 8 seconds and **Monochrome** fades from light grey through black and back every 9 seconds. Names, colours and board size are remembered in your browser.
- **Music:** a default track is bundled (see credit below). You can switch to *Choose file…* to play your own audio file (it stays on your computer and is never uploaded), or pick *No music*.
- **Speed:** a typical game takes around 13 minutes at 1× (it snowballs as colours capture each other's cannons), so you can start at 1×, 2×, 4×, 8× or 16× and change it at any time in game.
- In game: pause (Space), sound on/off and volume, fullscreen.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tuning

Game balance lives at the top of [`js/board.js`](js/board.js): `GRID_PRESETS` (squares per block) and `BOARD_CFG` (cannon spin rate, shot speed, burst spacing). The plinko cycle time (about 5 seconds per ball, set by gravity) sets the overall pace. The plinko layout and bumpers are in [`js/pegboard.js`](js/pegboard.js) (`PEG_CFG`), and the palette and the Rainbow/Monochrome animation in [`js/teams.js`](js/teams.js).

`js/board.js` has no DOM access, so the game rules can be simulated headlessly with Node.

## Credits

- Music: "Keep It Real" by Nick Petrov, from [Bensound.com](https://www.bensound.com). Bensound's free licence requires this credit to stay with the track; see their licence terms if you use it beyond this project.
- Physics: [Matter.js](https://brm.io/matter-js/) (MIT).

## Deploying

The site is static. On GitHub, go to *Settings → Pages* and serve from the `main` branch, root folder.
