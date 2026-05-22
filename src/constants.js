// Palette, canvas, typography, and tool constants shared across the editor.
// Extracted from App.jsx so components and lib helpers can import them
// without pulling in the whole App shell.

export const PALETTE = [
  { name: "black", value: "#1b1b1b" },
  { name: "red", value: "#cc4722" },
  { name: "yellow", value: "#ffbf35" },
  { name: "blue", value: "#94dbff" },
  { name: "lilac", value: "#b0afed" },
  { name: "pink", value: "#ff94c2" },
  { name: "white", value: "#ffffff" },
];

// Starting canvas dimensions and background; all become mutable state inside
// App so the user can switch between presets or pick a custom size.
export const DEFAULT_CANVAS_W = 1200;
export const DEFAULT_CANVAS_H = 900;
export const DEFAULT_CANVAS_BG = "#ffffff";

// Common poster / social-card sizes. `custom` is handled specially — it
// doesn't change dimensions, just unlocks the W/H fields.
export const CANVAS_PRESETS = [
  { id: "landscape", label: "LANDSCAPE", w: 1200, h: 900 },
  { id: "square", label: "SQUARE", w: 1080, h: 1080 },
  { id: "portrait", label: "PORTRAIT", w: 1080, h: 1350 },
  { id: "poster", label: "POSTER", w: 1240, h: 1754 }, // A4 at ~150dpi
  { id: "og", label: "BANNER", w: 1200, h: 630 },
];

// Grid sizes (in SVG user units). 0 means "no grid, no snap"; any non-zero
// value both renders a dot pattern and snaps drag positions to multiples.
export const GRID_PRESETS = [0, 8, 16, 24, 32, 64];

// localStorage key for the one-slot autosaved draft. Bump the version suffix
// if the layer schema changes in a way that would break hydration.
export const DRAFT_STORAGE_KEY = "postervg:draft:v1";

// How close (in SVG units) the dragged edge/center must be to a candidate
// before it snaps. Generous enough that users feel it without having to aim.
export const SNAP_THRESHOLD = 6;

export const TOOLS = [
  { id: "select", label: "SELECT", key: "V" },
  { id: "rect", label: "RECT", key: "R" },
  { id: "ellipse", label: "ELLIPSE", key: "O" },
  { id: "line", label: "LINE", key: "L" },
  { id: "polygon", label: "POLYGON", key: "P" },
  { id: "text", label: "TEXT", key: "T" },
];

export const TEXT_FONT_FAMILY = "Inter, system-ui, sans-serif";
export const TEXT_LINE_HEIGHT = 1.2;

// Curated set of web fonts. Each entry pairs a display label with a rendering
// stack and an optional Google Fonts CSS URL used to embed the font into
// exported SVGs so viewers without the font installed still see the intended
// typography. `inter` has no Google URL because the editor itself already
// loads Inter via index.html.
export const FONT_FAMILIES = [
  {
    id: "inter",
    label: "INTER",
    stack: "Inter, system-ui, sans-serif",
    google: null,
  },
  {
    id: "playfair",
    label: "SERIF",
    stack: '"Playfair Display", Georgia, serif',
    google:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
  },
  {
    id: "jetbrains",
    label: "MONO",
    stack: '"JetBrains Mono", "Courier New", monospace',
    google:
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
  },
  {
    id: "space-grotesk",
    label: "GROTESK",
    stack: '"Space Grotesk", Inter, sans-serif',
    google:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap",
  },
];

export const FONT_FAMILY_BY_ID = Object.fromEntries(
  FONT_FAMILIES.map((f) => [f.id, f]),
);
export const FONT_FAMILY_BY_STACK = Object.fromEntries(
  FONT_FAMILIES.map((f) => [f.stack, f]),
);

// Curated subset of CSS blend modes — the ones users reach for on posters.
export const BLEND_OPTIONS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "difference",
];

// Dash preset → SVG `stroke-dasharray` value. Solid is the absence of a
// dasharray and must be skipped on serialization.
export const DASH_PRESETS = {
  solid: null,
  dash: "8 4",
  dot: "2 4",
  "dash-dot": "8 4 2 4",
};

export const CAP_OPTIONS = ["butt", "round", "square"];
export const JOIN_OPTIONS = ["miter", "round", "bevel"];
