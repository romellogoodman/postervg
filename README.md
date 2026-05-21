# postervg

A browser tool for composing SVGs in layers.

Drop SVG files onto the canvas, draw primitives alongside them, arrange
everything in a layer stack, and export the result as a single SVG.

## Features

- **Drop SVGs**: drag any `.svg` file onto the canvas to place it as a layer
- **Shape Tools**: rectangle, ellipse, line — click-drag to draw
- **Text Tool**: click to place; edit content, size, alignment, and weight in the sidebar. Resize handles scale the font-size uniformly.
- **Select & Transform**: move, resize, rotate (hold Shift to snap rotation)
- **Fill / Stroke**: paired fill and stroke swatches with swap, none, and a custom color picker
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
| `⌫` / `Del` | delete selected |
| `⌘D` / `Ctrl+D` | duplicate selected |
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
