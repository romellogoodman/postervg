import { useState } from "react";
import { PALETTES } from "../constants.js";
import { NumField } from "./NumField.jsx";

// Generative / playful controls: cycle palettes, randomise colors, scatter
// clones around the primary selection, and spray a confetti burst across
// the canvas. Holds its own input state so numeric tweaks don't bloat App.
export function GenerativeSection({
  paletteIndex,
  selectedCount,
  onCyclePalette,
  onRandomizeColors,
  onScatter,
  onConfettiBurst,
}) {
  const [scatterCount, setScatterCount] = useState(12);
  const [scatterSpread, setScatterSpread] = useState(220);
  const [jitterRotate, setJitterRotate] = useState(true);
  const [jitterScale, setJitterScale] = useState(true);
  const [confettiCount, setConfettiCount] = useState(40);

  const palette = PALETTES[paletteIndex];
  const nextPalette = PALETTES[(paletteIndex + 1) % PALETTES.length];

  return (
    <div className="sidebar__section">
      <div className="sidebar__label">
        Generative
        <span className="sidebar__label-meta">· {palette.label}</span>
      </div>
      <button
        className="sidebar__button"
        onClick={onCyclePalette}
        title={`Remap every color to the ${nextPalette.label} palette`}
      >
        CYCLE PALETTE → {nextPalette.label}
      </button>
      <button
        className="sidebar__button"
        onClick={onRandomizeColors}
        title={
          selectedCount
            ? `Randomise fill on ${selectedCount} selected layer${selectedCount === 1 ? "" : "s"}`
            : "Randomise fill on every layer"
        }
      >
        RANDOMIZE COLORS
      </button>

      <div className="sidebar__fields" style={{ marginTop: 10 }}>
        <NumField
          label="Num"
          value={scatterCount}
          onChange={(v) => setScatterCount(Math.max(1, Math.round(v)))}
        />
        <NumField
          label="Sprd"
          value={scatterSpread}
          onChange={(v) => setScatterSpread(Math.max(0, Math.round(v)))}
        />
      </div>
      <label className="sidebar__toggle" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={jitterRotate}
          onChange={(e) => setJitterRotate(e.target.checked)}
        />
        <span>Jitter rotation</span>
      </label>
      <label className="sidebar__toggle" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={jitterScale}
          onChange={(e) => setJitterScale(e.target.checked)}
        />
        <span>Jitter scale</span>
      </label>
      <button
        className="sidebar__button"
        style={{ marginTop: 6 }}
        onClick={() =>
          onScatter(scatterCount, scatterSpread, jitterRotate, jitterScale)
        }
        disabled={selectedCount !== 1}
        title={
          selectedCount === 1
            ? "Scatter copies of the selected layer"
            : "Select a single layer to scatter"
        }
      >
        SCATTER
      </button>

      <div className="sidebar__fields" style={{ marginTop: 10 }}>
        <NumField
          label="Dots"
          value={confettiCount}
          onChange={(v) => setConfettiCount(Math.max(1, Math.round(v)))}
        />
      </div>
      <button
        className="sidebar__button"
        style={{ marginTop: 6 }}
        onClick={() => onConfettiBurst(confettiCount)}
        title="Spray random shapes across the canvas"
      >
        CONFETTI BURST
      </button>
    </div>
  );
}
