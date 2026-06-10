import { PALETTES } from "../constants.js";

// Generative / playful controls: cycle palettes and randomise colors.
export function GenerativeSection({
  paletteIndex,
  selectedCount,
  onCyclePalette,
  onRandomizeColors,
}) {
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
    </div>
  );
}
