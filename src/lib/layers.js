import {
  DASH_PRESETS,
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
} from "../constants.js";
import { nextId } from "./id.js";
import { gradientLine } from "./geometry.js";
import { measureText } from "./text.js";

// Convenience: read style properties with defaults so layers created before
// these fields existed still render correctly.
export const layerOpacity = (l) => (l.opacity == null ? 1 : l.opacity);
export const layerBlend = (l) =>
  l.blendMode && l.blendMode !== "normal" ? l.blendMode : null;
export const layerDashArray = (l) => {
  const preset = l.strokeDash ?? "solid";
  return DASH_PRESETS[preset] ?? null;
};
export const layerCap = (l) => l.strokeCap ?? "butt";
export const layerJoin = (l) => l.strokeJoin ?? "miter";

// Gradient defs are referenced by a stable per-layer id so the canvas render
// and the exported SVG agree.
export const gradientId = (layer) => `gr-${layer.id}`;

// A layer's fill is either its `fill` string (a color or "none") or — when
// `fillGradient` is set — a url(#…) reference to the layer's gradient def.
export const fillPaintValue = (layer) =>
  layer.fillGradient ? `url(#${gradientId(layer)})` : layer.fill;

// Serialise the gradient def for a layer with a linear gradient fill, or
// return "" if the layer has no gradient.
export function serializeGradientDef(layer) {
  const g = layer.fillGradient;
  if (!g) return "";
  const { x1, y1, x2, y2 } = gradientLine(g.angle ?? 90);
  return `<linearGradient id="${gradientId(layer)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>`;
}

export function defaultTextLayer(x, y, paint) {
  const text = "Text";
  const fontSize = 48;
  const fontWeight = "normal";
  const { width, height } = measureText(text, {
    fontSize,
    fontFamily: TEXT_FONT_FAMILY,
    fontWeight,
  });
  return {
    id: nextId(),
    type: "text",
    name: "Text",
    visible: true,
    locked: false,
    x,
    y,
    width,
    height,
    rotation: 0,
    // Text with no fill is usually a mistake; fall back to black ink.
    fill: paint.fill === "none" ? "#1b1b1b" : paint.fill,
    stroke: paint.stroke,
    strokeWidth: paint.stroke === "none" ? 0 : paint.strokeWidth,
    text,
    fontSize,
    fontFamily: TEXT_FONT_FAMILY,
    fontFamilyId: "inter",
    fontWeight,
    fontStyle: "normal",
    letterSpacing: 0,
    lineHeight: TEXT_LINE_HEIGHT,
    textAlign: "start",
    opacity: 1,
    blendMode: "normal",
    strokeDash: "solid",
    strokeCap: "butt",
    strokeJoin: "miter",
  };
}

export function defaultLayerForShape(type, x, y, w, h, paint) {
  // paint: { fill, stroke, strokeWidth }
  const base = {
    id: nextId(),
    type,
    name:
      type === "rect"
        ? "Rectangle"
        : type === "ellipse"
          ? "Ellipse"
          : type === "line"
            ? "Line"
            : type === "polygon"
              ? "Polygon"
              : "Layer",
    visible: true,
    locked: false,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    fill: paint.fill,
    stroke: paint.stroke,
    strokeWidth: paint.stroke === "none" ? 0 : paint.strokeWidth,
    opacity: 1,
    blendMode: "normal",
    strokeDash: "solid",
    strokeCap: "butt",
    strokeJoin: "miter",
  };
  if (type === "polygon") {
    base.sides = 5;
    base.starRatio = 1;
  }
  if (type === "line") {
    // Lines have no interior; use stroke (fallback to fill if stroke is none).
    base.fill = "none";
    base.stroke = paint.stroke !== "none" ? paint.stroke : paint.fill;
    base.strokeWidth = Math.max(1, paint.strokeWidth || 2);
  }
  return base;
}
