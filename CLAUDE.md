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
  - `gradientLine` / `serializeGradientDef` / `fillPaintValue` — linear-gradient math + fill helper (`src/App.jsx:54`, `:66`, `:76`)
  - `polygonPoints` — regular polygon + star inscribed in a bbox (`:79`)
  - `measureText` / `textAnchorX` / `defaultTextLayer` — text measurement + factory (`:118`, `:163`, `:169`)
  - `parseSvgFile` / `serializeAttrs` — SVG import (`:207`, `:248`)
  - `defaultLayerForShape` / `serializeLayerToSvg` — layer model (`:273`, `:317`)
  - `App` — state, pointer handlers, drop, keyboard, layout (`:379`)
  - `PaintSection` / `StrokeStyleRow` / `PaintBox` — fill + stroke controls, incl. dash/cap/join (`:1615`, `:1877`, `:1933`)
  - `LayerNode` — per-layer SVG rendering, emits gradient `<defs>` inline (`:1978`)
  - `SelectionOverlay` / `MultiSelectionOutline` — single-layer handles + multi-select outline (`:2147`, `:2224`)

**Layer style attributes:** `opacity` (0..1), `blendMode` (one of `BLEND_OPTIONS`), `strokeDash` (key of `DASH_PRESETS`), `strokeCap`, `strokeJoin`. Render and export go through `layerOpacity` / `layerBlend` / `layerDashArray` / `layerCap` / `layerJoin` so legacy layers without the fields still draw.

**Fill paint:** a layer's fill is either its `fill` string (a color or `"none"`) or — when `fillGradient: { from, to, angle }` is set — a `url(#gr-<layerId>)` reference to a `<linearGradient>` defined via `serializeGradientDef` (export) or an inline `<defs>` sibling in `LayerNode` (canvas). Use `fillPaintValue(layer)` at every fill site.

**Polygon:** one tool (`type: "polygon"`) parameterised by `sides` (3–24) and `starRatio` (0.1–1). `starRatio < 1` alternates outer/inner radii to produce stars.
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
