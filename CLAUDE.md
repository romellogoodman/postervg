# CLAUDE.md

## What

postervg is a browser-based layer editor for composing SVG files and
primitive shapes, exported as a single `.svg` (or `.png`). Aesthetic
reference: [brush.romellogoodman.com](https://brush.romellogoodman.com/).

## Stack

React 19 + Vite + SCSS. No canvas library — everything is SVG DOM.

## File Map

```
src/
  App.jsx                     # App shell: state, handlers, sidebar + canvas composition
  App.scss                    # all styles, BEM, tokens at the top
  main.jsx                    # React entry
  constants.js                # palette, canvas/grid/tool presets, fonts, dash/cap/join, blend modes
  lib/
    id.js                     # nextId() layer id generator
    geometry.js               # bboxCenter, screenToLocal, snapAxis, gradientLine, polygonPoints
    text.js                   # measureText, measureTextLayer, textAnchorX, fontPresetForLayer
    layers.js                 # layer factories + style helpers (opacity/blend/dash/cap/join/fill)
    svgIO.js                  # parseSvgFile, serializeAttrs, serializeLayerToSvg
  components/
    LayerNode.jsx             # per-layer SVG rendering; emits gradient <defs> inline
    SelectionOverlay.jsx      # SelectionOverlay (handles) + MultiSelectionOutline
    PaintSection.jsx          # Fill/Stroke sidebar + StrokeStyleRow + PaintBox
    InlineTextEditor.jsx      # contentEditable div inside <foreignObject> for text editing
    RepeatSection.jsx         # Array/Radial repeat controls (holds own input state)
    GenerativeSection.jsx     # palette cycle, randomize, scatter, confetti
    NumField.jsx              # labeled number input
```

Use the import graph, not line numbers, to find things. `App.jsx` imports
from every other module; nothing inside `lib/` or `components/` imports
back from `App.jsx`. `lib/` is pure (no React); `components/` is React.

When a subsystem outgrows its current home, extract it. Don't pre-split.

## Key concepts

**State inside `App`:**
- `selectedIds` is a `Set<string>`; `selectedLayers` is the filtered array;
  `selected` aliases `selectedLayers[0]` for back-compat with single-layer
  Properties/PaintSection paths.
- `commit(updater)` records the previous `layers` on the undo stack before
  applying the update. Use for any discrete mutation. Raw `setLayers` is
  reserved for per-frame drag updates; a single history entry is pushed on
  pointerup via `dragSnapshotRef`.

**Layer style attributes:** `opacity` (0..1), `blendMode` (one of
`BLEND_OPTIONS`), `strokeDash` (key of `DASH_PRESETS`), `strokeCap`,
`strokeJoin`. Render and export go through `layerOpacity` / `layerBlend` /
`layerDashArray` / `layerCap` / `layerJoin` (in `lib/layers.js`) so layers
created before these fields existed still draw correctly.

**Fill paint:** a layer's fill is either its `fill` string (a color or
`"none"`) or — when `fillGradient: { from, to, angle }` is set — a
`url(#gr-<layerId>)` reference to a `<linearGradient>` defined via
`serializeGradientDef` (export) or an inline `<defs>` sibling in
`LayerNode` (canvas). Use `fillPaintValue(layer)` at every fill site.

**Polygon:** one tool (`type: "polygon"`) parameterised by `sides` (3–24)
and `starRatio` (0.1–1). `starRatio < 1` alternates outer/inner radii to
produce stars.

**Text fields beyond size/weight:** `fontFamilyId` (key into
`FONT_FAMILIES`), `fontStyle` (normal|italic), `letterSpacing` (px),
`lineHeight` (em). All flow through `measureTextLayer` so the bbox tracks
content as any of them change. Double-click a text layer to edit its
content inline via `InlineTextEditor`; Escape commits. Export embeds each
used font as `@import` inside a CDATA-wrapped `<style>` block so viewers
without the font installed still get the right typography.

**Canvas state:** `canvasW`, `canvasH`, `canvasBg`, `gridSize` are state
on `App` (`CANVAS_PRESETS` and `GRID_PRESETS` in `constants.js`). The
background `<rect>`, the exported SVG root, and the on-canvas grid pattern
all read from these.

**Snap & guides:** while dragging, `snapAxis` (in `lib/geometry.js`) tests
the left/center/right edges of the dragged bounding box against every
other layer's edges + centers and the canvas midlines; matches within
`SNAP_THRESHOLD` (6 SVG units) snap the drag and surface a red guide line
(`activeGuides` state, cleared on pointerup). When no smart guide fires
and `gridSize > 0`, the fallback rounds the position to the nearest grid
multiple.

**Arrange / Repeat:** `alignSelected(edge)` moves every selected layer to
share a union-bbox edge. `distributeSelected(axis)` keeps the outer two
fixed and evenly spaces the rest by center. `createArray` and
`createRadial` (both on `App`) duplicate the primary selection; the
`RepeatSection` component owns the inputs driving them.

**Generative:** `paletteIndex` state tracks which entry of `PALETTES`
(in `constants.js`) is active; `PaintSection` renders swatches from this
palette, and `cyclePalette()` remaps every fill/stroke/gradient stop
slot-for-slot onto the next palette (custom hex colors not in the
palette survive). `randomizeColors()` rolls a random palette color for
each selected layer (or every layer if nothing is selected).
`scatterClones(count, spread, jitterRotate, jitterScale)` sprays jittered
copies of the primary selection within a radius. `confettiBurst(count)`
sprays random tiny dots/squares/triangles across the canvas. The
`GenerativeSection` component owns the input state for scatter + confetti.

**Clipboard:** ⌘C serialises the selection as
`{"_postervg": 1, "layers": [...]}` JSON to `navigator.clipboard`. ⌘V
reads the clipboard and, if it matches that payload, rehydrates each
layer with a fresh id and a +20/+20 offset. Otherwise, if the clipboard
contains a raw `<svg>` string it goes through `parseSvgFile` and lands
as one `svg`-type layer. Paste silently no-ops when clipboard access is
blocked.

**Autosave:** `layers` + canvas dims/bg/grid are persisted to
`localStorage[DRAFT_STORAGE_KEY]` on every change (debounced 400ms).
Page load hydrates the draft in a mount effect; `CLEAR` removes the key
so a reload doesn't resurrect the composition. Selection, history, and
`editingId` are intentionally not saved.

**Exports:** `buildExportSvg()` returns the final SVG string (shared by
both paths). `doExport` wraps it in a Blob and triggers a `.svg`
download; `doExportPng` loads that SVG into an `<Image>` and draws it
into an offscreen `<canvas>` to produce a PNG Blob.
`document.fonts.ready` is awaited first so `@import`'d Google Fonts have
a chance to render in the raster.

## How

```bash
npm run dev          # Vite on port 8080, auto-opens
npm run build
npm run lint         # also ships a --fix variant
npm run format
```

Verify UI changes in a browser before reporting done. Type checks and
linters do not catch interaction regressions in an editor like this.

## Conventions

- **SCSS uses BEM** (`.block__element--modifier`). Patterns live in
  `src/App.scss` — follow what's already there rather than inventing new
  ones.
- **Color + spacing tokens** are CSS custom properties at the top of
  `src/App.scss`. Use them instead of hard-coding values.
- **Pure helpers go under `src/lib/`; React components go under
  `src/components/`.** Keep the import direction one-way: `App.jsx` may
  import from both, `components/` may import from `lib/` and
  `constants.js`, `lib/` imports from `constants.js` only.

## Non-goals

- No backend, no auth, no remote sync. Local `localStorage` autosave is OK
  (one slot, device-only); anything that talks to a server is out.
- SVG DOM is the primary contract — the `.svg` export must stay
  hand-readable and real SVG. A PNG export is allowed as a secondary
  convenience because it rasterises the same SVG via an offscreen
  `<canvas>`; no new render engine or WebGL path.
- No design-system abstraction layer. Sub-components live next to their
  usage in `src/components/`.
