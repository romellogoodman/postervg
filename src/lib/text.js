import {
  FONT_FAMILY_BY_ID,
  FONT_FAMILY_BY_STACK,
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
} from "../constants.js";

// Measure rendered text via a hidden off-DOM SVG so the layer bbox can track
// content as text/size/weight change. Returns natural content dimensions.
// The measuring SVG is lazily created once and reused across calls.
let _measureSvg = null;
let _measureTextEl = null;
export function measureText(text, opts = {}) {
  const {
    fontSize = 48,
    fontFamily = TEXT_FONT_FAMILY,
    fontWeight = "normal",
    fontStyle = "normal",
    letterSpacing = 0,
    lineHeight = TEXT_LINE_HEIGHT,
  } = opts;
  if (typeof document === "undefined") {
    return { width: fontSize * 2, height: fontSize };
  }
  if (!_measureSvg) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.style.left = "-9999px";
    svg.style.top = "-9999px";
    svg.style.visibility = "hidden";
    svg.style.pointerEvents = "none";
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("dominant-baseline", "hanging");
    svg.appendChild(t);
    document.body.appendChild(svg);
    _measureSvg = svg;
    _measureTextEl = t;
  }
  const el = _measureTextEl;
  el.setAttribute("font-size", String(fontSize));
  el.setAttribute("font-family", fontFamily);
  el.setAttribute("font-weight", String(fontWeight));
  el.setAttribute("font-style", String(fontStyle));
  el.setAttribute("letter-spacing", String(letterSpacing));
  while (el.firstChild) el.removeChild(el.firstChild);
  const lines = String(text ?? "").split("\n");
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "tspan",
    );
    tspan.setAttribute("x", "0");
    if (i > 0) tspan.setAttribute("dy", `${lineHeight}em`);
    // Empty lines still need a glyph to contribute height; zero-width space
    // keeps the line visually empty but measurable.
    tspan.textContent = line.length ? line : "​";
    el.appendChild(tspan);
  });
  const bbox = el.getBBox();
  return {
    width: Math.max(1, bbox.width),
    height: Math.max(1, bbox.height),
  };
}

// Read typography opts off a text layer, optionally overriding specific
// fields. Handy when a handler is computing a new value and wants the bbox
// after the edit applies.
export function measureTextLayer(layer, overrides = {}) {
  return measureText(overrides.text ?? layer.text, {
    fontSize: overrides.fontSize ?? layer.fontSize,
    fontFamily: overrides.fontFamily ?? layer.fontFamily,
    fontWeight: overrides.fontWeight ?? layer.fontWeight,
    fontStyle: overrides.fontStyle ?? layer.fontStyle ?? "normal",
    letterSpacing: overrides.letterSpacing ?? layer.letterSpacing ?? 0,
    lineHeight: overrides.lineHeight ?? layer.lineHeight ?? TEXT_LINE_HEIGHT,
  });
}

export function textAnchorX(layer) {
  if (layer.textAlign === "middle") return layer.x + layer.width / 2;
  if (layer.textAlign === "end") return layer.x + layer.width;
  return layer.x;
}

// Look up the preset that owns a given rendering stack (or null if the user
// somehow has a layer with a custom stack).
export function fontPresetForLayer(layer) {
  if (layer.fontFamilyId) return FONT_FAMILY_BY_ID[layer.fontFamilyId] || null;
  return FONT_FAMILY_BY_STACK[layer.fontFamily] || null;
}
