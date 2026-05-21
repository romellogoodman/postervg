# postervg

A browser tool for composing SVGs in layers.

Drop SVG files onto the canvas, draw primitives alongside them, arrange
everything in a layer stack, and export the result as a single SVG.

## Features

- **Drop SVGs**: drag any `.svg` file onto the canvas to place it as a layer
- **Shape Tools**: rectangle, ellipse, line — click-drag to draw
- **Text Tool**: click to place; edit content, size, alignment, and weight in the sidebar. Resize handles scale the font-size uniformly.
- **Undo / Redo**: `⌘Z` / `⌘⇧Z` on every discrete mutation; drags collapse into a single history entry.
- **Select & Transform**: click, shift-click, or drag a marquee on empty canvas to select one or many layers; move, resize, rotate (hold Shift to snap rotation). Multi-select shows a dashed union outline and moves together; resize/rotate handles appear only for a single selection.
- **Nudge**: arrow keys move the selection 1px; Shift+arrow moves 10px.
- **Fill / Stroke**: paired fill and stroke swatches with swap, none, and a custom color picker; dash pattern (solid / dash / dot / dash-dot), line cap (butt / round / square), and line join (miter / round / bevel)
- **Opacity / Blend**: per-layer opacity slider and CSS blend mode (multiply / screen / overlay / darken / lighten / difference), both preserved in exported SVG
- **Layers Panel**: reorder, hide, lock, rename, delete
- **Export**: save the composition as a standalone `.svg`

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
| `T` | text |
| `⌘Z` / `Ctrl+Z` | undo |
| `⌘⇧Z` / `Ctrl+Y` | redo |
| `←` `→` `↑` `↓` | nudge 1px (hold Shift for 10px) |
| `⌫` / `Del` | delete selected |
| `⌘D` / `Ctrl+D` | duplicate selected |
| `Shift`+click | add/remove layer from selection |
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
