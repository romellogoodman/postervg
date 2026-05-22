# CLAUDE.md

## What

postervg is a browser-based layer editor for composing SVG files and
primitive shapes, exported as a single `.svg`. Aesthetic reference:
[brush.romellogoodman.com](https://brush.romellogoodman.com/).

## Stack

React 19 + Vite + SCSS. No canvas library — everything is SVG DOM.

## File Map

All UI and logic live in two files (intentional for a prototype):

- `src/App.jsx` — the entire editor, organized by helper + component
  - `FONT_FAMILIES` / `fontPresetForLayer` — curated web-font stacks + Google-Fonts URLs (`src/App.jsx:31`, `:73`)
  - `gradientLine` / `serializeGradientDef` / `fillPaintValue` — linear-gradient math + fill helper (`:103`, `:115`, `:125`)
  - `polygonPoints` — regular polygon + star inscribed in a bbox (`:128`)
  - `measureText` / `measureTextLayer` / `textAnchorX` / `defaultTextLayer` — text measurement + factory (`:167`, `:225`, `:236`, `:242`)
  - `parseSvgFile` / `serializeAttrs` — SVG import (`:283`, `:324`)
  - `defaultLayerForShape` / `serializeLayerToSvg` — layer model (`:349`, `:393`)
  - `App` — state, pointer handlers, drop, keyboard, layout (`:463`)
  - `PaintSection` / `StrokeStyleRow` / `PaintBox` — fill + stroke controls, incl. dash/cap/join (`:1852`, `:2114`, `:2170`)
  - `InlineTextEditor` — contentEditable div inside `<foreignObject>` for double-click text editing (`:2202`)
  - `LayerNode` — per-layer SVG rendering, emits gradient `<defs>` inline (`:2285`)
  - `SelectionOverlay` / `MultiSelectionOutline` — single-layer handles + multi-select outline (`:2456`, `:2533`)

**Layer style attributes:** `opacity` (0..1), `blendMode` (one of `BLEND_OPTIONS`), `strokeDash` (key of `DASH_PRESETS`), `strokeCap`, `strokeJoin`. Render and export go through `layerOpacity` / `layerBlend` / `layerDashArray` / `layerCap` / `layerJoin` so legacy layers without the fields still draw.

**Fill paint:** a layer's fill is either its `fill` string (a color or `"none"`) or — when `fillGradient: { from, to, angle }` is set — a `url(#gr-<layerId>)` reference to a `<linearGradient>` defined via `serializeGradientDef` (export) or an inline `<defs>` sibling in `LayerNode` (canvas). Use `fillPaintValue(layer)` at every fill site.

**Polygon:** one tool (`type: "polygon"`) parameterised by `sides` (3–24) and `starRatio` (0.1–1). `starRatio < 1` alternates outer/inner radii to produce stars.

**Text fields beyond size/weight:** `fontFamilyId` (key into `FONT_FAMILIES`), `fontStyle` (normal|italic), `letterSpacing` (px), `lineHeight` (em). All flow through `measureTextLayer` so the bbox tracks content as any of them change. Double-click a text layer to edit its content inline via `InlineTextEditor`; Escape commits. Export embeds each used font as `@import` inside a CDATA-wrapped `<style>` block so viewers without the font installed still get the right typography.

**Canvas state:** `canvasW`, `canvasH`, `canvasBg`, `gridSize` are state on `App` (`CANVAS_PRESETS` and `GRID_PRESETS` at file top). The background `<rect>`, the exported SVG root, and the on-canvas grid pattern all read from these. Use the presets dropdown or the W/H fields to change dimensions; canvas background picker sits under the same Canvas section.

**Snap & guides:** while dragging, `snapAxis` (file top) tests the left/center/right edges of the dragged layer's bounding box against every other layer's edges + centers and the canvas midlines; matches within `SNAP_THRESHOLD` (6 SVG units) snap the drag and surface a red guide line across the canvas (`activeGuides` state, cleared on pointerup). When no smart guide fires and `gridSize > 0`, the fallback rounds the position to the nearest grid multiple.

**Arrange / Repeat:** `alignSelected(edge)` moves every layer in the current selection to share a union-bbox edge (left/hcenter/right/top/vcenter/bottom). `distributeSelected(axis)` keeps the outer two layers fixed and evenly spaces the rest by center. `createArray(cols, rows, gapX, gapY)` duplicates the primary selection into a grid; `createRadial(count, radius, rotateWithRing)` sweeps copies around a circle and optionally rotates each copy to face outward. Both repeat helpers live on `App` and are driven by the `RepeatSection` component which owns its own input state.

**Clipboard:** ⌘C serialises the selection as `{"_postervg": 1, "layers": [...]}` JSON to `navigator.clipboard`. ⌘V reads the clipboard and, if it matches that payload, rehydrates each layer with a fresh id and a +20/+20 offset. If the clipboard instead contains a raw `<svg>` string it falls back to the same path as file drop (one `svg`-type layer). Paste silently no-ops when clipboard access is blocked.
- `src/App.scss` — all styles, BEM, tokens at the top

**State inside `App`:**
- `selectedIds` is a `Set<string>`; `selectedLayers` is the filtered array; `selected` aliases `selectedLayers[0]` for back-compat with single-layer Properties/PaintSection paths.
- `commit(updater)` records the previous `layers` on the undo stack before applying the update. Use for any discrete mutation. Raw `setLayers` is reserved for per-frame drag updates; a single history entry is pushed on pointerup via `dragSnapshotRef`.

Refactor into multiple files only when a subsystem clearly outgrows its
section. Don't pre-split.

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
  `src/App.scss` — follow what's already there rather than inventing new ones.
- **Color + spacing tokens** are CSS custom properties at the top of
  `src/App.scss`. Use them instead of hard-coding values.

## Non-goals

- No backend, no persistence, no auth.
- No canvas/WebGL renderer — SVG DOM is the contract (exports are real SVG).
- No design-system abstraction layer. Keep components local to `App.jsx`.
