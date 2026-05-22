import {
  CAP_OPTIONS,
  DASH_PRESETS,
  JOIN_OPTIONS,
  PALETTE,
} from "../constants.js";

// Sidebar section for fill + stroke. When a layer is selected, clicks mutate
// that layer via `commit`; with no selection, clicks adjust the defaults
// used for new shapes (`fillColor` / `strokeColor` / `strokeWidth` state
// owned by App).
export function PaintSection({
  selected,
  commit,
  fillColor,
  setFillColor,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  activeTarget,
  setActiveTarget,
}) {
  const displayFill = selected ? selected.fill ?? "none" : fillColor;
  const displayStroke = selected
    ? selected.strokeWidth
      ? selected.stroke ?? "none"
      : "none"
    : strokeColor;
  const displayStrokeWidth = selected
    ? selected.strokeWidth || 0
    : strokeWidth;

  const applyColor = (color) => {
    if (selected && !selected.locked) {
      commit((prev) =>
        prev.map((l) => {
          if (l.id !== selected.id) return l;
          if (activeTarget === "fill") return { ...l, fill: color };
          const sw = l.strokeWidth || 2;
          return { ...l, stroke: color, strokeWidth: color === "none" ? 0 : sw };
        }),
      );
    } else if (activeTarget === "fill") {
      setFillColor(color);
    } else {
      setStrokeColor(color);
    }
  };

  const applyNone = () => applyColor("none");

  const applyStrokeWidth = (w) => {
    if (selected && !selected.locked) {
      commit((prev) =>
        prev.map((l) =>
          l.id === selected.id
            ? { ...l, strokeWidth: Math.max(0, w) }
            : l,
        ),
      );
    } else {
      setStrokeWidth(Math.max(0, w));
    }
  };

  const swap = () => {
    if (selected && !selected.locked) {
      commit((prev) =>
        prev.map((l) => {
          if (l.id !== selected.id) return l;
          const newFill = l.strokeWidth ? l.stroke : "none";
          const newStroke = l.fill;
          return {
            ...l,
            fill: newFill,
            stroke: newStroke === "none" ? l.stroke : newStroke,
            strokeWidth: newStroke === "none" ? 0 : l.strokeWidth || 2,
          };
        }),
      );
    } else {
      setFillColor(strokeColor);
      setStrokeColor(fillColor);
    }
  };

  const resetDefaults = () => {
    if (selected && !selected.locked) {
      commit((prev) =>
        prev.map((l) =>
          l.id === selected.id
            ? {
                ...l,
                fill: "#ffffff",
                stroke: "#1b1b1b",
                strokeWidth: l.strokeWidth || 2,
              }
            : l,
        ),
      );
    } else {
      setFillColor("#ffffff");
      setStrokeColor("#1b1b1b");
      setStrokeWidth(2);
    }
  };

  return (
    <div className="sidebar__section">
      <div className="sidebar__label">Fill / Stroke</div>
      <div className="paint">
        <div className="paint__indicator">
          <PaintBox
            color={activeTarget === "stroke" ? displayStroke : displayFill}
            kind={activeTarget === "stroke" ? "stroke" : "fill"}
            active={true}
            onClick={() => {}}
            className="paint__box paint__box--front"
          />
          <PaintBox
            color={activeTarget === "stroke" ? displayFill : displayStroke}
            kind={activeTarget === "stroke" ? "fill" : "stroke"}
            active={false}
            onClick={() =>
              setActiveTarget(activeTarget === "fill" ? "stroke" : "fill")
            }
            className="paint__box paint__box--back"
          />
          <button
            className="paint__swap"
            onClick={swap}
            title="Swap fill and stroke (X)"
            aria-label="Swap fill and stroke"
          >
            ⇅
          </button>
        </div>
        <div className="paint__meta">
          <div className="paint__meta-label">
            {activeTarget === "fill" ? "FILL" : "STROKE"}
          </div>
          <div className="paint__meta-value">
            {activeTarget === "fill"
              ? displayFill === "none"
                ? "NONE"
                : displayFill.toUpperCase()
              : displayStroke === "none"
                ? "NONE"
                : displayStroke.toUpperCase()}
          </div>
          <div className="paint__quick">
            <button
              className="paint__quick-btn"
              onClick={applyNone}
              title="Set to none"
            >
              <span className="paint__none-glyph" aria-hidden />
              NONE
            </button>
            <button
              className="paint__quick-btn"
              onClick={resetDefaults}
              title="Default colors (white fill, black stroke)"
            >
              DEFAULT
            </button>
            {selected && activeTarget === "fill" && (
              <button
                className="paint__quick-btn"
                onClick={() => {
                  commit((prev) =>
                    prev.map((l) => {
                      if (l.id !== selected.id) return l;
                      if (l.fillGradient) {
                        // Flatten back to solid fill = the FROM stop.
                        const { fillGradient: _drop, ...rest } = l;
                        return { ...rest, fill: l.fillGradient.from };
                      }
                      const fromColor =
                        l.fill && l.fill !== "none" ? l.fill : "#1b1b1b";
                      return {
                        ...l,
                        fillGradient: {
                          from: fromColor,
                          to: "#ffffff",
                          angle: 90,
                        },
                      };
                    }),
                  );
                }}
                title="Toggle linear gradient fill"
              >
                {selected.fillGradient ? "SOLID" : "GRAD"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar__swatches" style={{ marginTop: 10 }}>
        {PALETTE.map((c) => {
          const isActive =
            (activeTarget === "fill" ? displayFill : displayStroke) === c.value;
          return (
            <button
              key={c.value}
              className={`sidebar__swatch${isActive ? " sidebar__swatch--active" : ""}`}
              style={{ background: c.value }}
              onClick={() => applyColor(c.value)}
              title={c.name}
            />
          );
        })}
        <label
          className="sidebar__swatch sidebar__swatch--picker"
          title="Custom color"
          style={{
            background:
              (activeTarget === "fill" ? displayFill : displayStroke) !==
                "none" &&
              !PALETTE.some(
                (c) =>
                  c.value ===
                  (activeTarget === "fill" ? displayFill : displayStroke),
              )
                ? activeTarget === "fill"
                  ? displayFill
                  : displayStroke
                : undefined,
          }}
        >
          <input
            type="color"
            value={
              (activeTarget === "fill" ? displayFill : displayStroke) ===
              "none"
                ? "#000000"
                : activeTarget === "fill"
                  ? displayFill
                  : displayStroke
            }
            onChange={(e) => applyColor(e.target.value)}
          />
          <span className="paint__picker-glyph">+</span>
        </label>
      </div>

      <label className="sidebar__field" style={{ marginTop: 10 }}>
        <span className="sidebar__field-label">WIDTH</span>
        <input
          className="sidebar__field-input"
          type="number"
          min="0"
          value={Math.round(displayStrokeWidth)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) applyStrokeWidth(n);
          }}
        />
      </label>
      <StrokeStyleRow selected={selected} commit={commit} />
    </div>
  );
}

// Stroke-style controls (dash pattern, cap, join). Only meaningful when a
// layer is selected; hidden otherwise because the defaults for new shapes
// live in the defaultLayerForShape factory.
function StrokeStyleRow({ selected, commit }) {
  if (!selected || selected.locked) return null;
  const setField = (field, value) =>
    commit((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, [field]: value } : l)),
    );
  return (
    <>
      <label className="sidebar__field sidebar__field--wide" style={{ marginTop: 8 }}>
        <span className="sidebar__field-label">DASH</span>
        <select
          className="sidebar__select"
          value={selected.strokeDash ?? "solid"}
          onChange={(e) => setField("strokeDash", e.target.value)}
        >
          {Object.keys(DASH_PRESETS).map((k) => (
            <option key={k} value={k}>
              {k.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <div className="sidebar__segmented" style={{ marginTop: 6 }}>
        <span className="sidebar__field-label">CAP</span>
        <div className="sidebar__segmented-group">
          {CAP_OPTIONS.map((cap) => (
            <button
              key={cap}
              className={`sidebar__segmented-btn${(selected.strokeCap ?? "butt") === cap ? " sidebar__segmented-btn--active" : ""}`}
              onClick={() => setField("strokeCap", cap)}
              title={cap}
            >
              {cap[0].toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar__segmented" style={{ marginTop: 6 }}>
        <span className="sidebar__field-label">JOIN</span>
        <div className="sidebar__segmented-group">
          {JOIN_OPTIONS.map((join) => (
            <button
              key={join}
              className={`sidebar__segmented-btn${(selected.strokeJoin ?? "miter") === join ? " sidebar__segmented-btn--active" : ""}`}
              onClick={() => setField("strokeJoin", join)}
              title={join}
            >
              {join[0].toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function PaintBox({ color, kind, active, onClick, className }) {
  const isNone = color === "none";
  const fillStyle = kind === "fill" ? (isNone ? "transparent" : color) : "none";
  const strokeStyle = kind === "stroke" ? (isNone ? "transparent" : color) : "none";
  return (
    <button
      type="button"
      className={`${className}${active ? " paint__box--active" : ""}`}
      onClick={onClick}
      title={kind === "fill" ? "Fill" : "Stroke"}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        {kind === "fill" ? (
          <rect x="2" y="2" width="20" height="20" fill={fillStyle} stroke="#1b1b1b" strokeWidth="1" />
        ) : (
          <rect x="2" y="2" width="20" height="20" fill="transparent" stroke={strokeStyle === "none" ? "#1b1b1b" : strokeStyle} strokeWidth="4" />
        )}
        {kind === "stroke" && (
          <rect x="7" y="7" width="10" height="10" fill="#ffffff" stroke="none" />
        )}
        {isNone && (
          <line x1="2" y1="22" x2="22" y2="2" stroke="#cc4722" strokeWidth="2" />
        )}
      </svg>
    </button>
  );
}
