import { useState } from "react";
import { NumField } from "./NumField.jsx";

// Array + radial repeat controls for the primary selection. Each holds its
// own local state so the inputs don't bloat App, and its values persist
// while the user tweaks before pressing the commit button.
export function RepeatSection({ selected, onArray, onRadial }) {
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(1);
  const [gapX, setGapX] = useState(20);
  const [gapY, setGapY] = useState(20);
  const [count, setCount] = useState(6);
  const [radius, setRadius] = useState(160);
  const [rotateWithRing, setRotateWithRing] = useState(false);
  if (!selected || selected.locked) return null;
  return (
    <div className="sidebar__section">
      <div className="sidebar__label">Repeat</div>
      <div className="sidebar__fields">
        <NumField label="Cols" value={cols} onChange={(v) => setCols(Math.max(1, Math.round(v)))} />
        <NumField label="Rows" value={rows} onChange={(v) => setRows(Math.max(1, Math.round(v)))} />
        <NumField label="GapX" value={gapX} onChange={setGapX} />
        <NumField label="GapY" value={gapY} onChange={setGapY} />
      </div>
      <button
        className="sidebar__button"
        style={{ marginTop: 6 }}
        onClick={() => onArray(cols, rows, gapX, gapY)}
      >
        ARRAY
      </button>
      <div className="sidebar__fields" style={{ marginTop: 6 }}>
        <NumField label="Num" value={count} onChange={(v) => setCount(Math.max(2, Math.round(v)))} />
        <NumField label="R" value={radius} onChange={(v) => setRadius(Math.max(1, Math.round(v)))} />
      </div>
      <label className="sidebar__toggle" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={rotateWithRing}
          onChange={(e) => setRotateWithRing(e.target.checked)}
        />
        <span>Rotate copies</span>
      </label>
      <button
        className="sidebar__button"
        style={{ marginTop: 6 }}
        onClick={() => onRadial(count, radius, rotateWithRing)}
      >
        RADIAL
      </button>
    </div>
  );
}
