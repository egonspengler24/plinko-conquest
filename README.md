# Plinko Conquest

A browser game where 24 colours fight over a 6×4 board of small squares. Each colour has a ball on a plinko board and a spinning cannon. The last colour with any squares wins.

No build step and no dependencies to install: it's plain HTML, CSS and JavaScript, with [Matter.js](https://brm.io/matter-js/) vendored for the physics.

## How it plays

- Every colour starts with a 20×20 block of squares and a cannon. All cannons spin together, clockwise, at the same constant rate (one turn about every 3 seconds). The number under each cannon starts at **1**.
- Each colour has one ball on the plinko board (right). When a ball reaches the bottom it lands on:
  - **x2** (left half): doubles that colour's number (1 → 2 → 4 → 8 → 16 …)
  - **R** (right half): **releases** the cannon. It fires that many shots in whatever direction the barrel is pointing at that moment, then the number resets to 1. While it's firing, the number shows the shots remaining in pink.
- The ball is then dropped back in at the top.
- **Each shot takes exactly one square.** It flies in a straight line (bouncing off the outer walls) and captures the first square it meets that isn't its own colour. So a stack of 8 takes 8 squares, in a short line along the barrel direction.
- A colour with no squares left is eliminated and its ball leaves the board. Last colour standing wins.

## Setting up a game

- Type a name into each of the 24 coloured fields (or use *Paste a list of names*). Blank fields fall back to the colour name. Names are remembered in your browser.
- **Music:** a default track is bundled (see credit below). You can switch to *Choose file…* to play your own audio file (it stays on your computer and is never uploaded), or pick *No music*.
- **Speed:** with one square per shot a full game at 1× can take an hour or more, so the game starts at 16× by default. Switch between 1×, 4×, 16× and 64× at any time, both on the setup screen and in game. As colours are eliminated their balls leave the board and the game would slow to a crawl, so it also speeds itself up automatically (up to 6×, shown as *Endgame ×N*). The rules never change, it just plays faster.
- In game: pause (Space), sound on/off and volume, fullscreen.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tuning

Game balance lives at the top of [`js/board.js`](js/board.js) (`BOARD_CFG`): cannon spin rate, shot speed and burst spacing. The plinko layout is in [`js/pegboard.js`](js/pegboard.js) (`PEG_CFG`), and the colours in [`js/teams.js`](js/teams.js).

`js/board.js` has no DOM access, so the game rules can be simulated headlessly with Node.

## Credits

- Music: "Keep It Real" by Nick Petrov, from [Bensound.com](https://www.bensound.com). Bensound's free licence requires this credit to stay with the track; see their licence terms if you use it beyond this project.
- Physics: [Matter.js](https://brm.io/matter-js/) (MIT).

## Deploying

The site is static. On GitHub, go to *Settings → Pages* and serve from the `main` branch, root folder.
