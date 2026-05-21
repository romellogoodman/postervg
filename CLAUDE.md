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
  - `measureText` / `textAnchorX` / `defaultTextLayer` — text measurement + factory (`src/App.jsx:35`, `:80`, `:86`)
  - `parseSvgFile` / `serializeAttrs` — SVG import (`:119`, `:160`)
  - `defaultLayerForShape` / `serializeLayerToSvg` — layer model (`:185`, `:218`)
  - `App` — state, pointer handlers, drop, keyboard, layout (`:261`)
  - `PaintSection` / `PaintBox` — fill/stroke controls (`:1059`, `:1287`)
  - `LayerNode` — per-layer SVG rendering (`:1332`)
  - `SelectionOverlay` — transform handles (`:1448`)
- `src/App.scss` — all styles, BEM, tokens at the top

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
