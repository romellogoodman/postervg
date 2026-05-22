import { TEXT_LINE_HEIGHT } from "../constants.js";
import { bboxCenter, polygonPoints } from "./geometry.js";
import {
  fillPaintValue,
  layerBlend,
  layerCap,
  layerDashArray,
  layerJoin,
  layerOpacity,
} from "./layers.js";
import { textAnchorX } from "./text.js";

// Parse a user-supplied SVG file (or clipboard string) into the minimal
// descriptor needed to place it as an `svg`-type layer.
export function parseSvgFile(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.querySelector("svg");
  if (!root) return null;
  const vb = root.getAttribute("viewBox");
  let [vx, vy, vw, vh] = [0, 0, 0, 0];
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) [vx, vy, vw, vh] = parts;
  }
  const attrW = parseFloat(root.getAttribute("width")) || vw || 200;
  const attrH = parseFloat(root.getAttribute("height")) || vh || 200;
  if (!vw || !vh) {
    vw = attrW;
    vh = attrH;
  }
  // Preserve root-level presentation attributes (fill, stroke, class, style,
  // etc.) so paths that rely on inherited styling from the root render
  // correctly.
  const overridden = new Set([
    "x",
    "y",
    "width",
    "height",
    "viewBox",
    "xmlns",
    "xmlns:xlink",
    "preserveaspectratio",
  ]);
  const rootAttrs = {};
  for (const a of root.attributes) {
    if (!overridden.has(a.name.toLowerCase())) rootAttrs[a.name] = a.value;
  }
  return {
    viewBox: `${vx} ${vy} ${vw} ${vh}`,
    innerHtml: root.innerHTML,
    rootAttrs,
    naturalW: attrW,
    naturalH: attrH,
  };
}

export function serializeAttrs(attrs) {
  return Object.entries(attrs || {})
    .map(
      ([k, v]) =>
        `${k}="${String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
    )
    .join(" ");
}

// Serialise one layer as a string of SVG markup. Emits common style attrs
// (opacity, mix-blend-mode, stroke dash/cap/join) only when they differ
// from SVG defaults, to keep the exported file tidy.
export function serializeLayerToSvg(l) {
  if (!l.visible) return "";
  const { cx, cy } = bboxCenter(l);
  const rot = l.rotation
    ? ` transform="rotate(${l.rotation} ${cx} ${cy})"`
    : "";
  const opacity = layerOpacity(l);
  const blend = layerBlend(l);
  const opacityPart = opacity < 1 ? ` opacity="${opacity}"` : "";
  const stylePart = blend ? ` style="mix-blend-mode:${blend}"` : "";
  const dash = layerDashArray(l);
  const cap = layerCap(l);
  const join = layerJoin(l);
  const dashPart = dash ? ` stroke-dasharray="${dash}"` : "";
  const capPart = cap !== "butt" ? ` stroke-linecap="${cap}"` : "";
  const joinPart = join !== "miter" ? ` stroke-linejoin="${join}"` : "";
  const strokeExtras = `${dashPart}${capPart}${joinPart}`;
  const fillAttr = fillPaintValue(l);
  if (l.type === "rect") {
    return `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" fill="${fillAttr}"${l.strokeWidth ? ` stroke="${l.stroke}" stroke-width="${l.strokeWidth}"${strokeExtras}` : ""}${opacityPart}${stylePart}${rot}/>`;
  }
  if (l.type === "ellipse") {
    const rx = l.width / 2;
    const ry = l.height / 2;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fillAttr}"${l.strokeWidth ? ` stroke="${l.stroke}" stroke-width="${l.strokeWidth}"${strokeExtras}` : ""}${opacityPart}${stylePart}${rot}/>`;
  }
  if (l.type === "line") {
    return `<line x1="${l.x}" y1="${l.y}" x2="${l.x + l.width}" y2="${l.y + l.height}" stroke="${l.stroke}" stroke-width="${l.strokeWidth}"${strokeExtras}${opacityPart}${stylePart}${rot}/>`;
  }
  if (l.type === "polygon") {
    return `<polygon points="${polygonPoints(l)}" fill="${fillAttr}"${l.strokeWidth ? ` stroke="${l.stroke}" stroke-width="${l.strokeWidth}"${strokeExtras}` : ""}${opacityPart}${stylePart}${rot}/>`;
  }
  if (l.type === "svg") {
    const extra = l.rootAttrs ? " " + serializeAttrs(l.rootAttrs) : "";
    // Opacity + blend go on the wrapping <g> so they apply to the whole
    // imported subtree.
    return `<g${opacityPart}${stylePart}${rot}><svg x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" viewBox="${l.viewBox}" preserveAspectRatio="xMidYMid meet"${extra}>${l.svgContent}</svg></g>`;
  }
  if (l.type === "text") {
    const escape = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const tx = textAnchorX(l);
    const lines = String(l.text ?? "").split("\n");
    const lineHeight = l.lineHeight ?? TEXT_LINE_HEIGHT;
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${tx}"${i > 0 ? ` dy="${lineHeight}em"` : ""}>${escape(line.length ? line : " ")}</tspan>`,
      )
      .join("");
    const strokePart = l.strokeWidth
      ? ` stroke="${l.stroke}" stroke-width="${l.strokeWidth}"${strokeExtras}`
      : "";
    const styleParts = [];
    if ((l.fontStyle ?? "normal") !== "normal")
      styleParts.push(` font-style="${l.fontStyle}"`);
    if ((l.letterSpacing ?? 0) !== 0)
      styleParts.push(` letter-spacing="${l.letterSpacing}"`);
    const extras = styleParts.join("");
    return `<text x="${tx}" y="${l.y}" font-size="${l.fontSize}" font-family="${escape(l.fontFamily)}" font-weight="${l.fontWeight}"${extras} text-anchor="${l.textAlign}" dominant-baseline="hanging" fill="${fillAttr}"${strokePart}${opacityPart}${stylePart}${rot}>${tspans}</text>`;
  }
  return "";
}
