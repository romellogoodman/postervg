# postervg

A browser tool for composing SVGs in layers.

Drop SVG files onto the canvas, draw primitives alongside them, arrange
everything in a layer stack, and export the result as a single SVG.

## Features

- **Drop SVGs**: drag any `.svg` file onto the canvas to place it as a layer
- **Shape Tools**: rectangle, ellipse, line, polygon/star — click-drag to draw. Polygons take a sides count (3–24) and a star ratio slider.
- **Gradient Fill**: toggle any solid fill into a linear gradient, pick from/to colors, rotate the angle (0–359°).
- **Text Tool**: click to place; double-click to edit inline. Sidebar controls cover font family (Inter / Serif / Mono / Grotesk), size, letter-spacing, line-height, weight, italic, and alignment. Exported SVG embeds used Google Fonts so viewers see the intended typography. Resize handles scale the font-size uniformly.
- **Undo / Redo**: `⌘Z` / `⌘⇧Z` on every discrete mutation; drags collapse into a single history entry.
- **Select & Transform**: click, shift-click, or drag a marquee on empty canvas to select one or many layers; move, resize, rotate (hold Shift to snap rotation). Multi-select shows a dashed union outline and moves together; resize/rotate handles appear only for a single selection.
- **Nudge**: arrow keys move the selection 1px; Shift+arrow moves 10px.
- **Fill / Stroke**: paired fill and stroke swatches with swap, none, and a custom color picker; dash pattern (solid / dash / dot / dash-dot), line cap (butt / round / square), and line join (miter / round / bevel)
- **Opacity / Blend**: per-layer opacity slider and CSS blend mode (multiply / screen / overlay / darken / lighten / difference), both preserved in exported SVG
- **Layers Panel**: reorder, hide, lock, rename, delete
- **Canvas**: size presets (landscape, square, portrait, A4 poster, OG banner) or custom W×H; background color picker; optional grid (off / 8 / 16 / 24 / 32 / 64 px) that both displays dots and snaps drags
- **Smart Guides**: dragging a layer shows red alignment guides when its edges or center line up with another layer or a canvas midline, snapping it there
- **Arrange**: with two or more layers selected, align left/center/right or top/middle/bottom; with three or more, distribute horizontally or vertically
- **Repeat**: turn any single layer into a grid (cols × rows + gaps) or a radial ring (count + radius, with optional rotate-to-face-outward)
- **Generative**: cycle through curated palettes (default / warm / cool / mono) and every color in the composition remaps slot-for-slot; randomize selected fills; scatter jittered copies around a layer; or spray a confetti burst of random shapes
- **Clipboard**: `⌘C` copies the selection, `⌘V` pastes either your own layers (offset) or any raw SVG string
- **Autosave**: your composition is kept in `localStorage` and restored on reload; `CLEAR` removes the draft too
- **Export**: save as a standalone `.svg` or rasterize to `.png`

## Quick Start

```bash
npm install
npm run dev
```

## Keyboard

| key | action |
| --- | --- |
| `V` | select tool |
| `R` | rectangle |
| `O` | ellipse |
| `L` | line |
| `P` | polygon |
| `T` | text |
| `⌘Z` / `Ctrl+Z` | undo |
| `⌘⇧Z` / `Ctrl+Y` | redo |
| `←` `→` `↑` `↓` | nudge 1px (hold Shift for 10px) |
| `⌫` / `Del` | delete selected |
| `⌘D` / `Ctrl+D` | duplicate selected |
| `⌘C` / `Ctrl+C` | copy selection |
| `⌘V` / `Ctrl+V` | paste (layers or raw SVG) |
| `Shift`+click | add/remove layer from selection |
| scroll / trackpad | zoom in/out (anchored on cursor) |
| `Space`+drag | pan the canvas |
| `0` | reset zoom & pan to fit |
| `Esc` | deselect |

## Tech Stack

- React 19 + Vite
- SVG DOM rendering (no canvas library)
- SCSS with BEM conventions

## Available Scripts

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Build for production
npm run lint         # Check for errors
npm run lint:fix     # Fix linting errors
npm run format       # Format code with Prettier
npm run preview      # Preview production build
npm run clean        # Remove build artifacts
```

## Project Guidelines

See [CLAUDE.md](CLAUDE.md) for development conventions.
