import { TEXT_LINE_HEIGHT } from "../constants.js";
import {
  bboxCenter,
  gradientLine,
  polygonPoints,
} from "../lib/geometry.js";
import {
  fillPaintValue,
  gradientId,
  layerBlend,
  layerCap,
  layerDashArray,
  layerJoin,
  layerOpacity,
} from "../lib/layers.js";
import { serializeAttrs } from "../lib/svgIO.js";
import { textAnchorX } from "../lib/text.js";

// Per-layer renderer. Each layer type produces its own SVG element(s);
// gradient fills are emitted as an inline <defs> sibling so they resolve in
// the same namespace. `data-layer-id` on the rendered element lets the
// canvas pointer handlers hit-test and identify which layer was clicked.
export function LayerNode({ layer }) {
  const { cx, cy } = bboxCenter(layer);
  const rot = layer.rotation
    ? `rotate(${layer.rotation} ${cx} ${cy})`
    : undefined;
  const blend = layerBlend(layer);
  // Render opacity combines the visibility fade (muted for hidden layers so
  // the user can still find them) with the user-set layer opacity.
  const common = {
    "data-layer-id": layer.id,
    opacity: (layer.visible ? 1 : 0.15) * layerOpacity(layer),
    style: {
      pointerEvents: layer.locked ? "none" : "auto",
      ...(blend ? { mixBlendMode: blend } : {}),
    },
    transform: rot,
  };
  // Stroke style extras (dash/cap/join) applied to any strokable element.
  const dash = layerDashArray(layer);
  const strokeStyle = {
    ...(dash ? { strokeDasharray: dash } : {}),
    strokeLinecap: layerCap(layer),
    strokeLinejoin: layerJoin(layer),
  };
  const fill = fillPaintValue(layer);
  const gradientDef = layer.fillGradient ? (
    <defs key="defs">
      <linearGradient
        id={gradientId(layer)}
        {...gradientLine(layer.fillGradient.angle ?? 90)}
      >
        <stop offset="0" stopColor={layer.fillGradient.from} />
        <stop offset="1" stopColor={layer.fillGradient.to} />
      </linearGradient>
    </defs>
  ) : null;
  if (layer.type === "rect") {
    return (
      <>
        {gradientDef}
        <rect
          {...common}
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          fill={fill}
          stroke={layer.strokeWidth ? layer.stroke : "none"}
          strokeWidth={layer.strokeWidth}
          {...strokeStyle}
        />
      </>
    );
  }
  if (layer.type === "ellipse") {
    return (
      <>
        {gradientDef}
        <ellipse
          {...common}
          cx={cx}
          cy={cy}
          rx={layer.width / 2}
          ry={layer.height / 2}
          fill={fill}
          stroke={layer.strokeWidth ? layer.stroke : "none"}
          strokeWidth={layer.strokeWidth}
          {...strokeStyle}
        />
      </>
    );
  }
  if (layer.type === "line") {
    return (
      <line
        {...common}
        x1={layer.x}
        y1={layer.y}
        x2={layer.x + layer.width}
        y2={layer.y + layer.height}
        stroke={layer.stroke}
        strokeWidth={Math.max(2, layer.strokeWidth || 2)}
        {...strokeStyle}
      />
    );
  }
  if (layer.type === "polygon") {
    return (
      <>
        {gradientDef}
        <polygon
          {...common}
          points={polygonPoints(layer)}
          fill={fill}
          stroke={layer.strokeWidth ? layer.stroke : "none"}
          strokeWidth={layer.strokeWidth}
          {...strokeStyle}
        />
      </>
    );
  }
  if (layer.type === "svg") {
    const extra = layer.rootAttrs ? " " + serializeAttrs(layer.rootAttrs) : "";
    const inner = `<svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="${layer.viewBox}" preserveAspectRatio="xMidYMid meet" overflow="visible"${extra}>${layer.svgContent}</svg>`;
    return (
      <g {...common}>
        <rect
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          fill="transparent"
          pointerEvents="all"
        />
        <g
          pointerEvents="none"
          dangerouslySetInnerHTML={{ __html: inner }}
        />
      </g>
    );
  }
  if (layer.type === "text") {
    const tx = textAnchorX(layer);
    const lines = String(layer.text ?? "").split("\n");
    return (
      <g {...common}>
        {gradientDef}
        {/* Invisible hit target so empty space inside the bbox still selects. */}
        <rect
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          fill="transparent"
          pointerEvents="all"
        />
        <text
          x={tx}
          y={layer.y}
          fontSize={layer.fontSize}
          fontFamily={layer.fontFamily}
          fontWeight={layer.fontWeight}
          fontStyle={layer.fontStyle ?? "normal"}
          letterSpacing={layer.letterSpacing ?? 0}
          fill={fill}
          stroke={layer.strokeWidth ? layer.stroke : "none"}
          strokeWidth={layer.strokeWidth || 0}
          {...strokeStyle}
          textAnchor={layer.textAlign}
          dominantBaseline="hanging"
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={tx}
              dy={i === 0 ? 0 : `${layer.lineHeight ?? TEXT_LINE_HEIGHT}em`}
            >
              {line.length ? line : "​"}
            </tspan>
          ))}
        </text>
      </g>
    );
  }
  return null;
}
