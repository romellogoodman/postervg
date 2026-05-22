import { bboxCenter } from "../lib/geometry.js";

// Single-layer selection overlay: union bbox outline + 8 resize handles and
// a rotate handle on a tether line. The whole overlay rotates with the
// layer so the handles stay on the visible corners.
export function SelectionOverlay({ layer, onHandle, onRotate }) {
  const { cx, cy } = bboxCenter(layer);
  const handles = [
    { id: "nw", x: layer.x, y: layer.y, cursor: "nwse-resize" },
    { id: "n", x: cx, y: layer.y, cursor: "ns-resize" },
    { id: "ne", x: layer.x + layer.width, y: layer.y, cursor: "nesw-resize" },
    { id: "e", x: layer.x + layer.width, y: cy, cursor: "ew-resize" },
    {
      id: "se",
      x: layer.x + layer.width,
      y: layer.y + layer.height,
      cursor: "nwse-resize",
    },
    { id: "s", x: cx, y: layer.y + layer.height, cursor: "ns-resize" },
    { id: "sw", x: layer.x, y: layer.y + layer.height, cursor: "nesw-resize" },
    { id: "w", x: layer.x, y: cy, cursor: "ew-resize" },
  ];
  const rotateHandle = { x: cx, y: layer.y - 30 };
  const transform = layer.rotation
    ? `rotate(${layer.rotation} ${cx} ${cy})`
    : undefined;
  const HS = 7; // handle size
  return (
    <g transform={transform} className="overlay" pointerEvents="none">
      <rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        fill="none"
        stroke="#1b1b1b"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx}
        y1={layer.y}
        x2={rotateHandle.x}
        y2={rotateHandle.y}
        stroke="#1b1b1b"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={rotateHandle.x}
        cy={rotateHandle.y}
        r={6}
        fill="#ffffff"
        stroke="#1b1b1b"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        pointerEvents="auto"
        style={{ cursor: "grab" }}
        onPointerDown={onRotate}
      />
      {handles.map((h) => (
        <rect
          key={h.id}
          x={h.x - HS / 2}
          y={h.y - HS / 2}
          width={HS}
          height={HS}
          fill="#ffffff"
          stroke="#1b1b1b"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          pointerEvents="auto"
          style={{ cursor: h.cursor }}
          onPointerDown={onHandle(h.id)}
        />
      ))}
    </g>
  );
}

// Shown when multiple layers are selected: just a union bbox outline, no
// handles. Group-transform handles belong to a later milestone.
export function MultiSelectionOutline({ layers }) {
  if (!layers.length) return null;
  // Union bbox computed in axis-aligned space; for rotated layers this is a
  // simple hull around the axis-aligned bbox, not the rotated footprint.
  const x1 = Math.min(...layers.map((l) => l.x));
  const y1 = Math.min(...layers.map((l) => l.y));
  const x2 = Math.max(...layers.map((l) => l.x + l.width));
  const y2 = Math.max(...layers.map((l) => l.y + l.height));
  return (
    <g className="overlay" pointerEvents="none">
      <rect
        x={x1}
        y={y1}
        width={x2 - x1}
        height={y2 - y1}
        fill="none"
        stroke="#1b1b1b"
        strokeWidth="1"
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
