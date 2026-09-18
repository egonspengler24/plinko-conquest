# Plinko Conquest

A browser game where 24 colours fight over a 6×4 board of small squares. Each colour has a ball on a plinko board and a spinning cannon. The last colour with any squares wins.

No build step and no dependencies to install: it's plain HTML, CSS and JavaScript, with [Matter.js](https://brm.io/matter-js/) vendored for the physics.

## How it plays

- There are 24 cannons, one on the middle square of each starting block. Every cannon has its own plinko ball and its own number, which starts at **1**. All cannons spin together, clockwise, at the same constant rate (one turn about every 3 seconds).
- Each ball drops down the plinko board (right). When it reaches the bottom it lands on:
  - **x2** (left half): doubles that cannon's number (1 → 2 → 4 → 8 → 16 …)
  - **R** (right half): **releases** the cannon. It fires that many shots in whatever direction the barrel is pointing at that moment, then the number resets to 1. While it's firing, the number shows the shots remaining in pink.
- The ball is then dropped back in at the top.
- **Each shot takes exactly one square.** It flies in a straight line and captures the first square it meets that isn't its own colour. So a stack of 8 takes 8 squares, in a short line along the barrel direction.
- **The board wraps around.** A shot that leaves the right edge comes back in from the left (and likewise top and bottom), so colours in the middle are no more exposed to fire than colours on the edge. In 4,000 simulated games every starting position won about equally often.
- **Capturing a cannon:** a cannon belongs to whichever colour owns the square underneath it. If a shot captures that square, the cannon, its ball and its built-up number all switch to the capturing colour. Cannons are never removed; they keep circling and firing for their new owner, so a colour with more cannons has more firepower. A white ring marks a cannon (and ball) that has changed hands.
- A colour with no squares left is out. The last colour standing wins.

## Setting up a game

- Type a name into each of the 24 coloured fields (or use *Paste a list of names*). Blank fields fall back to the colour name. Names are remembered in your browser.
- **Music:** a default track is bundled (see credit below). You can switch to *Choose file…* to play your own audio file (it stays on your computer and is never uploaded), or pick *No music*.
- **Speed:** a typical game takes around 25 minutes at 1× (it snowballs as colours capture each other's cannons), so you can start at 1×, 2×, 4×, 8× or 16× and change it at any time in game.
- In game: pause (Space), sound on/off and volume, fullscreen.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tuning

Game balance lives at the top of [`js/board.js`](js/board.js) (`BOARD_CFG`): cannon spin rate, shot speed and burst spacing. The plinko cycle time (about 5 seconds per ball) sets the overall pace. The plinko layout is in [`js/pegboard.js`](js/pegboard.js) (`PEG_CFG`), and the colours in [`js/teams.js`](js/teams.js).

`js/board.js` has no DOM access, so the game rules can be simulated headlessly with Node.

## Credits

- Music: "Keep It Real" by Nick Petrov, from [Bensound.com](https://www.bensound.com). Bensound's free licence requires this credit to stay with the track; see their licence terms if you use it beyond this project.
- Physics: [Matter.js](https://brm.io/matter-js/) (MIT).

## Deploying

The site is static. On GitHub, go to *Settings → Pages* and serve from the `main` branch, root folder.
