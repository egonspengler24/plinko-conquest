// The 24 teams, laid out row-major to match the 6x4 board.
const TEAM_DEFS = [
  ['Purple',     '#6b00b5'], ['Forest',   '#005a00'], ['Teal',    '#12b39a'], ['Tan',      '#a8865a'], ['Red',    '#d40000'], ['Green',  '#00a000'],
  ['Mint',       '#5aa85a'], ['Navy',     '#00007a'], ['Grey',    '#606060'], ['Indigo',   '#2f0a70'], ['Magenta','#b400b4'], ['Mustard','#a8a000'],
  ['Brown',      '#7a3a00'], ['Silver',   '#b0b0b0'], ['Plum',    '#5a0a66'], ['Periwinkle','#6a6ab0'], ['Olive',  '#5a5a00'], ['Cyan',   '#00b0b8'],
  ['Deep Teal',  '#006a6a'], ['Blue',     '#0000c8'], ['Orchid',  '#a860a8'], ['Salmon',   '#b86060'], ['Orange', '#d9730d'], ['Maroon', '#5a0000'],
];

const TEAM_COUNT = TEAM_DEFS.length;
const BOARD_BLOCKS_X = 6;
const BOARD_BLOCKS_Y = 4;

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

const TEAMS = TEAM_DEFS.map(([label, tile]) => ({ label, tile, bright: brighten(tile) }));

if (typeof module !== 'undefined') module.exports = { TEAMS, TEAM_COUNT, BOARD_BLOCKS_X, BOARD_BLOCKS_Y };
