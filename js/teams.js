// The colour palette. 24 solid colours (from the reference video) plus two animated ones:
// Rainbow cycles through the hues, Monochrome fades from light grey through black and back.
//
// Each entry resolves to { tile, bright, ball, shot }:
//   tile   - the colour of the owned squares
//   bright - the colour of the cannon: a lighter version of the tile (for Monochrome, a contrasting one)
//   ball   - the colour of the plinko ball; vivid and never black, so it always shows on the black board
//   shot   - the colour of the shots

const SOLIDS = [
  ['Purple',     '#6b00b5'], ['Forest',   '#005a00'], ['Teal',    '#12b39a'], ['Tan',      '#a8865a'], ['Red',    '#d40000'], ['Green',  '#00a000'],
  ['Mint',       '#5aa85a'], ['Navy',     '#00007a'], ['Grey',    '#606060'], ['Indigo',   '#2f0a70'], ['Magenta','#b400b4'], ['Mustard','#a8a000'],
  ['Brown',      '#7a3a00'], ['Silver',   '#b0b0b0'], ['Plum',    '#5a0a66'], ['Periwinkle','#6a6ab0'], ['Olive',  '#5a5a00'], ['Cyan',   '#00b0b8'],
  ['Deep Teal',  '#006a6a'], ['Blue',     '#0000c8'], ['Orchid',  '#a860a8'], ['Salmon',   '#b86060'], ['Orange', '#d9730d'], ['Maroon', '#5a0000'],
];

const RAINBOW_PERIOD = 8; // seconds for a full trip round the hues
const MONO_PERIOD = 9;    // seconds for light grey -> black -> light grey

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

// Balls and cannons use a brighter version of the territory colour so they stand out on it.
function brighten(hex) {
  const [h, s, l] = hexToHsl(hex);
  const nl = Math.min(0.8, Math.max(0.55, l + 0.3));
  return `hsl(${h.toFixed(0)}, ${Math.round(Math.max(s, 0.5) * (s < 0.05 ? 0 : 100))}%, ${Math.round(nl * 100)}%)`;
}

// The cannon colour. Most tiles are lifted to a light, vivid version of their own hue. But olive is just dark
// yellow and brown is just dark orange, and lightening those a lot turns them into plain yellow and orange,
// so dark yellows and oranges only get a small lift and stay recognisably olive and brown.
function cannonColor(hex) {
  const [h, s, l] = hexToHsl(hex);
  if (h >= 15 && h <= 75 && l < 0.3) return `hsl(${h.toFixed(0)}, ${Math.round(s * 100)}%, ${Math.round((l + 0.1) * 100)}%)`;
  return brighten(hex);
}

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const PALETTE = [
  ...SOLIDS.map(([label, tile]) => {
    const vivid = brighten(tile);
    return { id: slug(label), label, kind: 'solid', tile, bright: cannonColor(tile), ball: vivid, shot: vivid, css: tile };
  }),
  { id: 'rainbow', label: 'Rainbow', kind: 'rainbow', css: 'linear-gradient(135deg, #ff2d2d, #ffa500, #ffe600, #2ecc40, #1e90ff, #8a2be2)' },
  { id: 'mono', label: 'Monochrome', kind: 'mono', css: 'linear-gradient(135deg, #e6e6e6, #808080, #000)' },
];

const PALETTE_BY_ID = Object.fromEntries(PALETTE.map((p) => [p.id, p]));

// The default 6x4 line-up follows the reference video, except that Rainbow and Monochrome
// take the places of the two near-duplicate neutrals (Silver and Grey).
const DEFAULT_LINEUP = SOLIDS.map(([label]) => slug(label)).map((id) => (id === 'grey' ? 'mono' : id === 'silver' ? 'rainbow' : id));

const isAnimated = (entry) => entry.kind !== 'solid';

// The colours of an entry `t` seconds into the game. Solid entries never change.
function resolveColor(entry, t) {
  if (entry.kind === 'rainbow') {
    const h = Math.round(((t / RAINBOW_PERIOD) * 360) % 360);
    const bright = `hsl(${h}, 95%, 72%)`;
    return { tile: `hsl(${h}, 80%, 42%)`, bright, ball: bright, shot: bright };
  }
  if (entry.kind === 'mono') {
    const L = 0.44 + 0.44 * Math.cos((t / MONO_PERIOD) * Math.PI * 2); // 0.88 light grey -> 0 black -> back
    const grey = (x) => `hsl(0, 0%, ${(x * 100).toFixed(1)}%)`;
    const contrast = L > 0.5 ? grey(0.1) : grey(0.9);   // always contrasts with the tile
    return {
      tile: grey(L),
      bright: contrast,
      ball: grey(0.28 + (0.62 * L) / 0.88),      // fades, but never disappears against the black board
      shot: contrast,
    };
  }
  return entry;
}

if (typeof module !== 'undefined') module.exports = { PALETTE, PALETTE_BY_ID, DEFAULT_LINEUP, resolveColor, isAnimated };
