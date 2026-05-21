import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";

const PALETTE = [
  { name: "black", value: "#1b1b1b" },
  { name: "red", value: "#cc4722" },
  { name: "yellow", value: "#ffbf35" },
  { name: "blue", value: "#94dbff" },
  { name: "lilac", value: "#b0afed" },
  { name: "pink", value: "#ff94c2" },
  { name: "white", value: "#ffffff" },
];

const CANVAS_W = 1200;
const CANVAS_H = 900;

const TOOLS = [
  { id: "select", label: "SELECT", key: "V" },
  { id: "rect", label: "RECT", key: "R" },
  { id: "ellipse", label: "ELLIPSE", key: "O" },
  { id: "line", label: "LINE", key: "L" },
  { id: "polygon", label: "POLYGON", key: "P" },
  { id: "text", label: "TEXT", key: "T" },
];

const TEXT_FONT_FAMILY = "Inter, system-ui, sans-serif";
const TEXT_LINE_HEIGHT = 1.2;

// Curated set of web fonts. Each entry pairs a display label with a rendering
// stack and an optional Google Fonts CSS URL used to embed the font into
// exported SVGs so viewers without the font installed still see the intended
// typography. `inter` has no Google URL because the editor itself already
// loads Inter via index.html.
const FONT_FAMILIES = [
  {
    id: "inter",
    label: "INTER",
    stack: "Inter, system-ui, sans-serif",
    google: null,
  },
  {
    id: "playfair",
    label: "SERIF",
    stack: '"Playfair Display", Georgia, serif',
    google:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
  },
  {
    id: "jetbrains",
    label: "MONO",
    stack: '"JetBrains Mono", "Courier New", monospace',
    google:
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
  },
  {
    id: "space-grotesk",
    label: "GROTESK",
    stack: '"Space Grotesk", Inter, sans-serif',
    google:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap",
  },
];

const FONT_FAMILY_BY_ID = Object.fromEntries(
  FONT_FAMILIES.map((f) => [f.id, f]),
);
const FONT_FAMILY_BY_STACK = Object.fromEntries(
  FONT_FAMILIES.map((f) => [f.stack, f]),
);

// Look up the preset that owns a given rendering stack (or null if the user
// somehow has a layer with a custom stack).
function fontPresetForLayer(layer) {
  if (layer.fontFamilyId) return FONT_FAMILY_BY_ID[layer.fontFamilyId] || null;
  return FONT_FAMILY_BY_STACK[layer.fontFamily] || null;
}

// Curated subset of CSS blend modes — the ones users reach for on posters.
const BLEND_OPTIONS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "difference",
];

// Dash preset → SVG `stroke-dasharray` value. Solid is the absence of a
// dasharray and must be skipped on serialization.
const DASH_PRESETS = {
  solid: null,
  dash: "8 4",
  dot: "2 4",
  "dash-dot": "8 4 2 4",
};

const CAP_OPTIONS = ["butt", "round", "square"];
const JOIN_OPTIONS = ["miter", "round", "bevel"];

// Map a 0..359° angle to the linear-gradient vector in bounding-box units.
// angle=0 is left→right, 90 is top→bottom — the web convention.
function gradientLine(angle) {
  // angle=0° → horizontal (left→right). angle=90° → vertical (top→bottom),
  // since SVG y increases downward. The start/end line is centered on the
  // bounding box in objectBoundingBox units.
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

const gradientId = (layer) => `gr-${layer.id}`;

function serializeGradientDef(layer) {
  const g = layer.fillGradient;
  if (!g) return "";
  const { x1, y1, x2, y2 } = gradientLine(g.angle ?? 90);
  return `<linearGradient id="${gradientId(layer)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>`;
}

const fillPaintValue = (layer) =>
  layer.fillGradient ? `url(#${gradientId(layer)})` : layer.fill;

// Compute `<polygon points="...">` coordinates for a regular polygon or star
// inscribed in the layer's bbox. `starRatio` < 1 alternates outer/inner radii
// to form a star; 1 is a regular polygon. First vertex points up.
function polygonPoints(layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rx = layer.width / 2;
  const ry = layer.height / 2;
  const sides = Math.max(3, Math.round(layer.sides ?? 5));
  const ratio = Math.max(0.05, Math.min(1, layer.starRatio ?? 1));
  const isStar = ratio < 1;
  const n = isStar ? sides * 2 : sides;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rScale = isStar && i % 2 === 1 ? ratio : 1;
    const x = cx + rx * rScale * Math.cos(t);
    const y = cy + ry * rScale * Math.sin(t);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

// Convenience: read style properties with defaults so layers created before
// these fields existed still render correctly.
const layerOpacity = (l) => (l.opacity == null ? 1 : l.opacity);
const layerBlend = (l) =>
  l.blendMode && l.blendMode !== "normal" ? l.blendMode : null;
const layerDashArray = (l) => {
  const preset = l.strokeDash ?? "solid";
  return DASH_PRESETS[preset] ?? null;
};
const layerCap = (l) => l.strokeCap ?? "butt";
const layerJoin = (l) => l.strokeJoin ?? "miter";

let _uid = 0;
const nextId = () => `l${Date.now().toString(36)}${(_uid++).toString(36)}`;

// Measure rendered text via a hidden off-DOM SVG so the layer bbox can track
// content as text/size/weight change. Returns natural content dimensions.
let _measureSvg = null;
let _measureTextEl = null;
function measureText(text, opts = {}) {
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
    // Empty lines still need a glyph to contribute height; zero-width space keeps
    // the line visually empty but measurable.
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
function measureTextLayer(layer, overrides = {}) {
  return measureText(overrides.text ?? layer.text, {
    fontSize: overrides.fontSize ?? layer.fontSize,
    fontFamily: overrides.fontFamily ?? layer.fontFamily,
    fontWeight: overrides.fontWeight ?? layer.fontWeight,
    fontStyle: overrides.fontStyle ?? layer.fontStyle ?? "normal",
    letterSpacing: overrides.letterSpacing ?? layer.letterSpacing ?? 0,
    lineHeight: overrides.lineHeight ?? layer.lineHeight ?? TEXT_LINE_HEIGHT,
  });
}

function textAnchorX(layer) {
  if (layer.textAlign === "middle") return layer.x + layer.width / 2;
  if (layer.textAlign === "end") return layer.x + layer.width;
  return layer.x;
}

function defaultTextLayer(x, y, paint) {
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

function parseSvgFile(text) {
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
  // Preserve root-level presentation attributes (fill, stroke, class, style, etc.)
  // so paths that rely on inherited styling from the root render correctly.
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

function serializeAttrs(attrs) {
  return Object.entries(attrs || {})
    .map(
      ([k, v]) =>
        `${k}="${String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
    )
    .join(" ");
}

function bboxCenter(l) {
  return { cx: l.x + l.width / 2, cy: l.y + l.height / 2 };
}

// Convert a point from screen coords to the un-rotated local space of a layer.
// Rotation is about the bbox center.
function screenToLocal(layer, px, py) {
  const { cx, cy } = bboxCenter(layer);
  const rad = (-(layer.rotation || 0) * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  return { lx, ly };
}

function defaultLayerForShape(type, x, y, w, h, paint) {
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

function serializeLayerToSvg(l) {
  if (!l.visible) return "";
  const { cx, cy } = bboxCenter(l);
  const rot = l.rotation
    ? ` transform="rotate(${l.rotation} ${cx} ${cy})"`
    : "";
  // Common style attrs: opacity, blend mode, and stroke dash/cap/join. Emit
  // only when they differ from the SVG defaults, to keep exports tidy.
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

function App() {
  const [layers, setLayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [tool, setTool] = useState("select");
  const [fillColor, setFillColor] = useState("#1b1b1b");
  const [strokeColor, setStrokeColor] = useState("none");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [activeTarget, setActiveTarget] = useState("fill"); // 'fill' | 'stroke'
  const [drawing, setDrawing] = useState(null); // { type, start, current }
  const [drag, setDrag] = useState(null); // { mode, layerId, layerIds?, startPointer, startLayer, startLayers?, handle? }
  const [marquee, setMarquee] = useState(null); // { start, current, additive }
  const [editingId, setEditingId] = useState(null); // text layer currently being inline-edited
  const [dropping, setDropping] = useState(false);
  // History: past/future hold snapshots of `layers`. Selection is UI state and
  // is deliberately not undoable.
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const svgRef = useRef(null);
  // Track the latest layers synchronously so imperative helpers (commit/undo,
  // drag snapshots) can read without stale closures.
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  // Snapshot of `layers` taken at the start of a drag/resize/rotate, so we can
  // push a single history entry on pointerup instead of one per move frame.
  const dragSnapshotRef = useRef(null);

  const selectedLayers = useMemo(
    () => layers.filter((l) => selectedIds.has(l.id)),
    [layers, selectedIds],
  );
  // Back-compat alias: a single "primary" selection drives the Properties
  // panel, PaintSection target, and single-layer overlay handles.
  const selected = selectedLayers[0] || null;

  // Selection helpers.
  const selectOnly = useCallback((id) => {
    setSelectedIds(id == null ? new Set() : new Set([id]));
  }, []);
  const selectToggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectMany = useCallback((ids) => {
    setSelectedIds(new Set(ids));
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Commit a layer mutation and record the previous state on the undo stack.
  // Use for discrete actions (add/remove/property edit); raw `setLayers` is
  // reserved for per-frame updates during a drag.
  const commit = useCallback((updater) => {
    const prev = layersRef.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    if (next === prev) return;
    setPast((p) => [...p, prev]);
    setFuture([]);
    setLayers(next);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      const current = layersRef.current;
      setFuture((f) => [current, ...f]);
      setLayers(prev);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      const current = layersRef.current;
      setPast((p) => [...p, current]);
      setLayers(next);
      return f.slice(1);
    });
  }, []);

  // Convert a client (mouse) coordinate to SVG user-space coordinate.
  const clientToSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;
      // While inline-editing a text layer the editor swallows its own keys;
      // skip global shortcuts so typing `r` doesn't switch to the rect tool.
      if (editingId) return;
      const k = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      // Undo / redo first so tool-letter fallbacks don't swallow ⌘Z etc.
      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((mod && k === "z" && e.shiftKey) || (mod && k === "y")) {
        e.preventDefault();
        redo();
        return;
      }
      if (k === "v") setTool("select");
      else if (k === "r") setTool("rect");
      else if (k === "o") setTool("ellipse");
      else if (k === "l") setTool("line");
      else if (k === "p") setTool("polygon");
      else if (k === "t") setTool("text");
      else if (k === "escape") clearSelection();
      else if (k === "backspace" || k === "delete") {
        if (selectedIds.size) {
          commit((prev) => prev.filter((l) => !selectedIds.has(l.id)));
          clearSelection();
        }
      } else if (k === "d" && mod) {
        if (selectedIds.size) {
          e.preventDefault();
          const cloneIds = [];
          commit((prev) => {
            // Duplicate each selected layer in-place with a +16/+16 offset.
            const result = [];
            for (const l of prev) {
              result.push(l);
              if (selectedIds.has(l.id)) {
                const id = nextId();
                cloneIds.push(id);
                result.push({
                  ...l,
                  id,
                  x: l.x + 16,
                  y: l.y + 16,
                  name: l.name + " copy",
                });
              }
            }
            return result;
          });
          selectMany(cloneIds);
        }
      } else if (
        k === "arrowleft" ||
        k === "arrowright" ||
        k === "arrowup" ||
        k === "arrowdown"
      ) {
        if (!selectedIds.size) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (k === "arrowleft") dx = -step;
        else if (k === "arrowright") dx = step;
        else if (k === "arrowup") dy = -step;
        else if (k === "arrowdown") dy = step;
        commit((prev) =>
          prev.map((l) =>
            selectedIds.has(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l,
          ),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, commit, clearSelection, selectMany, undo, redo, editingId]);

  // Pointer handling on the SVG canvas
  const handleCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    const hitLayerId = e.target.closest("[data-layer-id]")?.dataset?.layerId;

    if (tool === "select") {
      if (hitLayerId) {
        const l = layers.find((x) => x.id === hitLayerId);
        if (!l || l.locked) return;
        // Shift-click toggles membership; plain click on a non-selected layer
        // replaces the selection. Clicking an already-selected layer keeps the
        // whole set so the user can drag a group.
        let moveIds;
        if (e.shiftKey) {
          const next = new Set(selectedIds);
          if (next.has(hitLayerId)) next.delete(hitLayerId);
          else next.add(hitLayerId);
          setSelectedIds(next);
          moveIds = [...next];
        } else if (selectedIds.has(hitLayerId)) {
          moveIds = [...selectedIds];
        } else {
          setSelectedIds(new Set([hitLayerId]));
          moveIds = [hitLayerId];
        }
        const startLayers = layers
          .filter((x) => moveIds.includes(x.id))
          .map((x) => ({ ...x }));
        dragSnapshotRef.current = layersRef.current;
        setDrag({
          mode: "move",
          layerIds: moveIds,
          startPointer: pt,
          startLayers,
        });
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        // Empty-canvas click: start a marquee. Shift extends the current
        // selection; otherwise the marquee replaces it on pointerup.
        if (!e.shiftKey) clearSelection();
        setMarquee({ start: pt, current: pt, additive: e.shiftKey });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    // Text is click-to-place, not drag-to-size: drop a default text layer at
    // the cursor, select it, and fall back to the select tool so the user
    // edits via the sidebar rather than drawing another.
    if (tool === "text") {
      const paint = { fill: fillColor, stroke: strokeColor, strokeWidth };
      const layer = defaultTextLayer(pt.x, pt.y, paint);
      commit((prev) => [...prev, layer]);
      selectOnly(layer.id);
      setTool("select");
      return;
    }

    // Drawing tool
    clearSelection();
    setDrawing({ type: tool, start: pt, current: pt });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e) => {
    const pt = clientToSvg(e.clientX, e.clientY);
    if (drawing) {
      setDrawing((d) => (d ? { ...d, current: pt } : d));
      return;
    }
    if (marquee) {
      setMarquee((m) => (m ? { ...m, current: pt } : m));
      return;
    }
    if (drag) {
      if (drag.mode === "move") {
        const dx = pt.x - drag.startPointer.x;
        const dy = pt.y - drag.startPointer.y;
        // Multi-layer move: apply the same delta to every layer whose start
        // position was captured on pointerdown.
        const startById = new Map(drag.startLayers.map((l) => [l.id, l]));
        setLayers((prev) =>
          prev.map((l) => {
            const s = startById.get(l.id);
            return s ? { ...l, x: s.x + dx, y: s.y + dy } : l;
          }),
        );
      } else if (drag.mode === "resize") {
        const sl = drag.startLayer;
        const { lx, ly } = screenToLocal(sl, pt.x, pt.y);
        const h = drag.handle; // 'n','s','e','w','ne','nw','se','sw'
        let nx = sl.x;
        let ny = sl.y;
        let nw = sl.width;
        let nh = sl.height;
        if (h.includes("e")) nw = Math.max(2, lx - sl.x);
        if (h.includes("w")) {
          nw = Math.max(2, sl.x + sl.width - lx);
          nx = sl.x + sl.width - nw;
        }
        if (h.includes("s")) nh = Math.max(2, ly - sl.y);
        if (h.includes("n")) {
          nh = Math.max(2, sl.y + sl.height - ly);
          ny = sl.y + sl.height - nh;
        }
        // For text layers, resize handles scale font-size uniformly instead of
        // stretching the bbox independently. We derive the scale from whichever
        // axis the active handle drives, then re-measure to snap the bbox to
        // the new content extent.
        let nextFontSize = null;
        if (sl.type === "text") {
          const affectsX = h.includes("e") || h.includes("w");
          const affectsY = h.includes("n") || h.includes("s");
          let scale = 1;
          if (affectsX && affectsY) {
            scale = Math.max(nw / sl.width, nh / sl.height);
          } else if (affectsX) {
            scale = nw / sl.width;
          } else if (affectsY) {
            scale = nh / sl.height;
          }
          nextFontSize = Math.max(4, sl.fontSize * scale);
          const m = measureTextLayer(sl, { fontSize: nextFontSize });
          nw = m.width;
          nh = m.height;
          // Anchor to the opposite edge from the handle so the grabbed corner
          // tracks the pointer.
          nx = h.includes("w") ? sl.x + sl.width - nw : sl.x;
          ny = h.includes("n") ? sl.y + sl.height - nh : sl.y;
        }
        // Keep center stable under rotation when top-left changes.
        // Recompute the original center and new center; shift so rotated center stays put.
        if (sl.rotation) {
          const oldCx = sl.x + sl.width / 2;
          const oldCy = sl.y + sl.height / 2;
          const newCxLocal = nx + nw / 2;
          const newCyLocal = ny + nh / 2;
          // Rotate the center offset back into screen coords.
          const rad = (sl.rotation * Math.PI) / 180;
          const ddx = newCxLocal - oldCx;
          const ddy = newCyLocal - oldCy;
          const sdx = ddx * Math.cos(rad) - ddy * Math.sin(rad);
          const sdy = ddx * Math.sin(rad) + ddy * Math.cos(rad);
          nx += sdx - ddx;
          ny += sdy - ddy;
        }
        setLayers((prev) =>
          prev.map((l) => {
            if (l.id !== drag.layerId) return l;
            const next = { ...l, x: nx, y: ny, width: nw, height: nh };
            if (nextFontSize != null) next.fontSize = nextFontSize;
            return next;
          }),
        );
      } else if (drag.mode === "rotate") {
        const sl = drag.startLayer;
        const cx = sl.x + sl.width / 2;
        const cy = sl.y + sl.height / 2;
        const a0 = Math.atan2(
          drag.startPointer.y - cy,
          drag.startPointer.x - cx,
        );
        const a1 = Math.atan2(pt.y - cy, pt.x - cx);
        let deg = sl.rotation + ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        setLayers((prev) =>
          prev.map((l) =>
            l.id === drag.layerId ? { ...l, rotation: deg } : l,
          ),
        );
      }
    }
  };

  const handleCanvasPointerUp = (e) => {
    if (drawing) {
      const { type, start, current } = drawing;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w > 2 || h > 2 || type === "line") {
        const paint = { fill: fillColor, stroke: strokeColor, strokeWidth };
        let layer;
        if (type === "line") {
          layer = defaultLayerForShape(
            "line",
            start.x,
            start.y,
            current.x - start.x,
            current.y - start.y,
            paint,
          );
        } else {
          layer = defaultLayerForShape(
            type,
            x,
            y,
            Math.max(w, 2),
            Math.max(h, 2),
            paint,
          );
        }
        commit((prev) => [...prev, layer]);
        selectOnly(layer.id);
        setTool("select");
      }
      setDrawing(null);
    }
    if (marquee) {
      // Commit the marquee: pick every unlocked layer whose bbox intersects.
      const x1 = Math.min(marquee.start.x, marquee.current.x);
      const y1 = Math.min(marquee.start.y, marquee.current.y);
      const x2 = Math.max(marquee.start.x, marquee.current.x);
      const y2 = Math.max(marquee.start.y, marquee.current.y);
      // Treat a tiny marquee as a deliberate empty click (already cleared).
      if (x2 - x1 > 2 || y2 - y1 > 2) {
        const hit = layers
          .filter(
            (l) =>
              !l.locked &&
              l.x < x2 &&
              l.x + l.width > x1 &&
              l.y < y2 &&
              l.y + l.height > y1,
          )
          .map((l) => l.id);
        if (marquee.additive) {
          const next = new Set(selectedIds);
          for (const id of hit) next.add(id);
          setSelectedIds(next);
        } else {
          selectMany(hit);
        }
      }
      setMarquee(null);
    }
    if (drag && dragSnapshotRef.current) {
      // One history entry per drag gesture, regardless of move frame count.
      const snap = dragSnapshotRef.current;
      if (snap !== layersRef.current) {
        setPast((p) => [...p, snap]);
        setFuture([]);
      }
      dragSnapshotRef.current = null;
    }
    setDrag(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const startHandleDrag = (handle) => (e) => {
    e.stopPropagation();
    if (!selected) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    dragSnapshotRef.current = layersRef.current;
    setDrag({
      mode: "resize",
      layerId: selected.id,
      handle,
      startPointer: pt,
      startLayer: { ...selected },
    });
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const startRotateDrag = (e) => {
    e.stopPropagation();
    if (!selected) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    dragSnapshotRef.current = layersRef.current;
    setDrag({
      mode: "rotate",
      layerId: selected.id,
      startPointer: pt,
      startLayer: { ...selected },
    });
    svgRef.current.setPointerCapture(e.pointerId);
  };

  // File-drop: accept .svg
  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setDropping(false);
      const files = [...(e.dataTransfer?.files || [])].filter((f) =>
        f.name.toLowerCase().endsWith(".svg"),
      );
      if (!files.length) return;
      const pt = clientToSvg(e.clientX, e.clientY);
      const news = [];
      for (const f of files) {
        const text = await f.text();
        const parsed = parseSvgFile(text);
        if (!parsed) continue;
        const w = Math.min(parsed.naturalW, 400);
        const h = Math.min(parsed.naturalH, 400);
        news.push({
          id: nextId(),
          type: "svg",
          name: f.name.replace(/\.svg$/i, ""),
          visible: true,
          locked: false,
          x: pt.x - w / 2,
          y: pt.y - h / 2,
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          blendMode: "normal",
          viewBox: parsed.viewBox,
          svgContent: parsed.innerHtml,
          rootAttrs: parsed.rootAttrs,
        });
      }
      if (news.length) {
        commit((prev) => [...prev, ...news]);
        selectOnly(news[news.length - 1].id);
      }
    },
    [clientToSvg, commit, selectOnly],
  );

  // Layers panel ops
  const toggleVisible = (id) =>
    commit((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    );
  const toggleLocked = (id) =>
    commit((prev) =>
      prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    );
  const renameLayer = (id, name) =>
    commit((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  const removeLayer = (id) => {
    commit((prev) => prev.filter((l) => l.id !== id));
    if (selectedIds.has(id)) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };
  const moveLayer = (id, dir) => {
    commit((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i < 0) return prev;
      const j = dir === "up" ? i + 1 : i - 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const doExport = () => {
    const body = layers.map(serializeLayerToSvg).join("\n");
    // Collect distinct Google Font URLs used by any visible text layer and
    // embed them as @import in a <style> block — this lets downstream SVG
    // viewers render with the intended typography even without the font
    // installed locally. (Viewers that strip <style> will fall back to the
    // next font in the stack.)
    const fontUrls = Array.from(
      new Set(
        layers
          .filter((l) => l.visible && l.type === "text")
          .map((l) => fontPresetForLayer(l)?.google)
          .filter(Boolean),
      ),
    );
    const fontImports = fontUrls
      .map((u) => `@import url('${u}');`)
      .join("");
    // CSS lives inside <style> as text; the Google Fonts URL contains `&`
    // which XML parsers would otherwise read as an entity reference. CDATA
    // keeps the URL intact.
    const fontStyleBlock = fontImports
      ? `<style><![CDATA[${fontImports}]]></style>`
      : "";
    const gradientDefs = layers
      .map(serializeGradientDef)
      .filter(Boolean)
      .join("");
    const inner = fontStyleBlock + gradientDefs;
    const defsBlock = inner ? `<defs>${inner}</defs>\n` : "";
    const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
${defsBlock}<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>
${body}
</svg>`;
    const blob = new Blob([out], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "postervg.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const doClear = () => {
    if (!layers.length) return;
    if (window.confirm("Clear all layers?")) {
      commit([]);
      clearSelection();
    }
  };

  // In-progress shape preview
  const preview = useMemo(() => {
    if (!drawing) return null;
    const { type, start, current } = drawing;
    const previewFill = fillColor === "none" ? "transparent" : fillColor;
    const previewStroke = strokeColor === "none" ? "#1b1b1b" : strokeColor;
    const lineStroke = strokeColor !== "none" ? strokeColor : fillColor;
    if (type === "line") {
      return (
        <line
          x1={start.x}
          y1={start.y}
          x2={current.x}
          y2={current.y}
          stroke={lineStroke === "none" ? "#1b1b1b" : lineStroke}
          strokeWidth={Math.max(1, strokeWidth || 2)}
          strokeDasharray="4 3"
        />
      );
    }
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    if (type === "rect")
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={previewFill}
          opacity="0.6"
          stroke={previewStroke}
          strokeDasharray="4 3"
        />
      );
    if (type === "ellipse")
      return (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={previewFill}
          opacity="0.6"
          stroke={previewStroke}
          strokeDasharray="4 3"
        />
      );
    if (type === "polygon") {
      // Preview uses the default polygon shape (pentagon) inscribed in the
      // in-progress bbox so the user can see what they're about to commit.
      const points = polygonPoints({ x, y, width: w, height: h, sides: 5, starRatio: 1 });
      return (
        <polygon
          points={points}
          fill={previewFill}
          opacity="0.6"
          stroke={previewStroke}
          strokeDasharray="4 3"
        />
      );
    }
    return null;
  }, [drawing, fillColor, strokeColor, strokeWidth]);

  return (
    <div className="editor">
      <aside className="editor__sidebar sidebar">
        <div className="sidebar__section">
          <div className="sidebar__label">Tool</div>
          <div className="sidebar__tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`sidebar__tool${tool === t.id ? " sidebar__tool--active" : ""}`}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.key})`}
              >
                <span className="sidebar__tool-label">{t.label}</span>
                <span className="sidebar__tool-key">{t.key}</span>
              </button>
            ))}
          </div>
        </div>

        <PaintSection
          selected={selected}
          commit={commit}
          fillColor={fillColor}
          setFillColor={setFillColor}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          activeTarget={activeTarget}
          setActiveTarget={setActiveTarget}
        />

        {selected && (
          <div className="sidebar__section">
            <div className="sidebar__label">
              Properties
              {selectedIds.size > 1 && (
                <span className="sidebar__label-meta">
                  · {selectedIds.size} selected
                </span>
              )}
            </div>
            <div className="sidebar__fields">
              <NumField
                label="X"
                value={Math.round(selected.x)}
                onChange={(v) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, x: v } : l,
                    ),
                  )
                }
              />
              <NumField
                label="Y"
                value={Math.round(selected.y)}
                onChange={(v) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, y: v } : l,
                    ),
                  )
                }
              />
              <NumField
                label="W"
                value={Math.round(selected.width)}
                onChange={(v) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? { ...l, width: Math.max(2, v) }
                        : l,
                    ),
                  )
                }
              />
              <NumField
                label="H"
                value={Math.round(selected.height)}
                onChange={(v) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? { ...l, height: Math.max(2, v) }
                        : l,
                    ),
                  )
                }
              />
              <NumField
                label="Rot"
                value={Math.round(selected.rotation || 0)}
                onChange={(v) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, rotation: v } : l,
                    ),
                  )
                }
              />
            </div>
            <div className="sidebar__slider-row">
              <span className="sidebar__field-label">Opacity</span>
              <input
                className="sidebar__slider"
                type="range"
                min="0"
                max="100"
                value={Math.round(layerOpacity(selected) * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, opacity: v } : l,
                    ),
                  );
                }}
              />
              <span className="sidebar__slider-value">
                {Math.round(layerOpacity(selected) * 100)}
              </span>
            </div>
            <label className="sidebar__field sidebar__field--wide">
              <span className="sidebar__field-label">Blend</span>
              <select
                className="sidebar__select"
                value={selected.blendMode ?? "normal"}
                onChange={(e) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? { ...l, blendMode: e.target.value }
                        : l,
                    ),
                  )
                }
              >
                {BLEND_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {selected && selected.fillGradient && (
          <div className="sidebar__section">
            <div className="sidebar__label">Gradient</div>
            <div className="sidebar__gradient">
              <label
                className="sidebar__gradient-stop"
                title="Gradient start color"
              >
                <span
                  className="sidebar__gradient-swatch"
                  style={{ background: selected.fillGradient.from }}
                />
                <input
                  type="color"
                  value={selected.fillGradient.from}
                  onChange={(e) =>
                    commit((prev) =>
                      prev.map((l) =>
                        l.id === selected.id
                          ? {
                              ...l,
                              fillGradient: {
                                ...l.fillGradient,
                                from: e.target.value,
                              },
                            }
                          : l,
                      ),
                    )
                  }
                />
                <span className="sidebar__gradient-label">FROM</span>
              </label>
              <button
                className="sidebar__gradient-swap"
                onClick={() =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? {
                            ...l,
                            fillGradient: {
                              ...l.fillGradient,
                              from: l.fillGradient.to,
                              to: l.fillGradient.from,
                            },
                          }
                        : l,
                    ),
                  )
                }
                title="Swap stops"
              >
                ⇄
              </button>
              <label
                className="sidebar__gradient-stop"
                title="Gradient end color"
              >
                <span
                  className="sidebar__gradient-swatch"
                  style={{ background: selected.fillGradient.to }}
                />
                <input
                  type="color"
                  value={selected.fillGradient.to}
                  onChange={(e) =>
                    commit((prev) =>
                      prev.map((l) =>
                        l.id === selected.id
                          ? {
                              ...l,
                              fillGradient: {
                                ...l.fillGradient,
                                to: e.target.value,
                              },
                            }
                          : l,
                      ),
                    )
                  }
                />
                <span className="sidebar__gradient-label">TO</span>
              </label>
            </div>
            <div className="sidebar__slider-row" style={{ marginTop: 8 }}>
              <span className="sidebar__field-label">Angle</span>
              <input
                className="sidebar__slider"
                type="range"
                min="0"
                max="359"
                value={selected.fillGradient.angle ?? 90}
                onChange={(e) =>
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? {
                            ...l,
                            fillGradient: {
                              ...l.fillGradient,
                              angle: Number(e.target.value),
                            },
                          }
                        : l,
                    ),
                  )
                }
              />
              <span className="sidebar__slider-value">
                {selected.fillGradient.angle ?? 90}°
              </span>
            </div>
          </div>
        )}

        {selected && selected.type === "polygon" && (
          <div className="sidebar__section">
            <div className="sidebar__label">Polygon</div>
            <div className="sidebar__fields">
              <NumField
                label="Sides"
                value={selected.sides ?? 5}
                onChange={(v) => {
                  const sides = Math.max(3, Math.min(24, Math.round(v)));
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, sides } : l,
                    ),
                  );
                }}
              />
            </div>
            <div className="sidebar__slider-row">
              <span className="sidebar__field-label">Star</span>
              <input
                className="sidebar__slider"
                type="range"
                min="10"
                max="100"
                value={Math.round((selected.starRatio ?? 1) * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, starRatio: v } : l,
                    ),
                  );
                }}
              />
              <span className="sidebar__slider-value">
                {Math.round((selected.starRatio ?? 1) * 100)}
              </span>
            </div>
          </div>
        )}

        {selected && selected.type === "text" && (
          <div className="sidebar__section">
            <div className="sidebar__label">Text</div>
            <textarea
              className="sidebar__textarea"
              value={selected.text}
              rows={3}
              onChange={(e) => {
                const text = e.target.value;
                const m = measureTextLayer(selected, { text });
                commit((prev) =>
                  prev.map((l) =>
                    l.id === selected.id
                      ? { ...l, text, width: m.width, height: m.height }
                      : l,
                  ),
                );
              }}
            />
            <label className="sidebar__field sidebar__field--wide" style={{ marginTop: 8 }}>
              <span className="sidebar__field-label">FONT</span>
              <select
                className="sidebar__select"
                value={selected.fontFamilyId ?? "inter"}
                onChange={(e) => {
                  const preset = FONT_FAMILY_BY_ID[e.target.value];
                  if (!preset) return;
                  const m = measureTextLayer(selected, {
                    fontFamily: preset.stack,
                  });
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? {
                            ...l,
                            fontFamilyId: preset.id,
                            fontFamily: preset.stack,
                            width: m.width,
                            height: m.height,
                          }
                        : l,
                    ),
                  );
                }}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sidebar__fields" style={{ marginTop: 6 }}>
              <NumField
                label="Size"
                value={Math.round(selected.fontSize)}
                onChange={(v) => {
                  const fontSize = Math.max(4, v);
                  const m = measureTextLayer(selected, { fontSize });
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? {
                            ...l,
                            fontSize,
                            width: m.width,
                            height: m.height,
                          }
                        : l,
                    ),
                  );
                }}
              />
              <NumField
                label="Track"
                value={Math.round(selected.letterSpacing ?? 0)}
                onChange={(v) => {
                  const letterSpacing = v;
                  const m = measureTextLayer(selected, { letterSpacing });
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? {
                            ...l,
                            letterSpacing,
                            width: m.width,
                            height: m.height,
                          }
                        : l,
                    ),
                  );
                }}
              />
            </div>
            <div className="sidebar__slider-row">
              <span className="sidebar__field-label">Lead</span>
              <input
                className="sidebar__slider"
                type="range"
                min="80"
                max="200"
                value={Math.round((selected.lineHeight ?? TEXT_LINE_HEIGHT) * 100)}
                onChange={(e) => {
                  const lineHeight = Number(e.target.value) / 100;
                  const m = measureTextLayer(selected, { lineHeight });
                  commit((prev) =>
                    prev.map((l) =>
                      l.id === selected.id
                        ? {
                            ...l,
                            lineHeight,
                            width: m.width,
                            height: m.height,
                          }
                        : l,
                    ),
                  );
                }}
              />
              <span className="sidebar__slider-value">
                {Math.round((selected.lineHeight ?? TEXT_LINE_HEIGHT) * 100)}
              </span>
            </div>
            <div className="sidebar__align-group" style={{ marginTop: 8 }}>
              {[
                { id: "start", label: "L", title: "Align left" },
                { id: "middle", label: "C", title: "Align center" },
                { id: "end", label: "R", title: "Align right" },
              ].map((a) => (
                <button
                  key={a.id}
                  className={`sidebar__align-btn${selected.textAlign === a.id ? " sidebar__align-btn--active" : ""}`}
                  onClick={() =>
                    commit((prev) =>
                      prev.map((l) =>
                        l.id === selected.id
                          ? { ...l, textAlign: a.id }
                          : l,
                      ),
                    )
                  }
                  title={a.title}
                >
                  {a.label}
                </button>
              ))}
              <button
                className={`sidebar__align-btn sidebar__align-btn--bold${selected.fontWeight === "bold" ? " sidebar__align-btn--active" : ""}`}
                onClick={() =>
                  commit((prev) =>
                    prev.map((l) => {
                      if (l.id !== selected.id) return l;
                      const fontWeight =
                        l.fontWeight === "bold" ? "normal" : "bold";
                      const m = measureTextLayer(l, { fontWeight });
                      return {
                        ...l,
                        fontWeight,
                        width: m.width,
                        height: m.height,
                      };
                    }),
                  )
                }
                title="Toggle bold"
              >
                B
              </button>
              <button
                className={`sidebar__align-btn sidebar__align-btn--italic${(selected.fontStyle ?? "normal") === "italic" ? " sidebar__align-btn--active" : ""}`}
                onClick={() =>
                  commit((prev) =>
                    prev.map((l) => {
                      if (l.id !== selected.id) return l;
                      const fontStyle =
                        (l.fontStyle ?? "normal") === "italic"
                          ? "normal"
                          : "italic";
                      const m = measureTextLayer(l, { fontStyle });
                      return {
                        ...l,
                        fontStyle,
                        width: m.width,
                        height: m.height,
                      };
                    }),
                  )
                }
                title="Toggle italic"
              >
                I
              </button>
            </div>
          </div>
        )}

        <div className="sidebar__spacer" />

        <div className="sidebar__section">
          <button className="sidebar__button" onClick={doClear}>
            CLEAR
          </button>
          <button className="sidebar__button" onClick={doExport}>
            EXPORT
          </button>
        </div>
      </aside>

      <main
        className={`editor__canvas-wrap${dropping ? " editor__canvas-wrap--dropping" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={handleDrop}
      >
        <svg
          ref={svgRef}
          className="canvas"
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onDoubleClick={(e) => {
            const hit = e.target.closest("[data-layer-id]")?.dataset?.layerId;
            if (!hit) return;
            const l = layers.find((x) => x.id === hit);
            if (l && l.type === "text" && !l.locked) {
              setEditingId(hit);
              selectOnly(hit);
            }
          }}
          style={{
            cursor:
              tool === "select" ? "default" : drawing ? "crosshair" : "crosshair",
          }}
        >
          <rect
            x="0"
            y="0"
            width={CANVAS_W}
            height={CANVAS_H}
            fill="#ffffff"
            stroke="#1b1b1b"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {layers.map((l) =>
            // While inline-editing a text layer we render the editor in place
            // of the glyphs so the user doesn't see both at once.
            l.id === editingId ? null : (
              <LayerNode key={l.id} layer={l} selected={selectedIds.has(l.id)} />
            ),
          )}
          {editingId &&
            (() => {
              const l = layers.find((x) => x.id === editingId);
              if (!l || l.type !== "text") return null;
              const { cx, cy } = bboxCenter(l);
              return (
                <foreignObject
                  x={l.x}
                  y={l.y}
                  // Give the editor some slack so the caret + growing text
                  // aren't clipped by the layer's current bbox.
                  width={Math.max(l.width + 200, 200)}
                  height={Math.max(l.height + 80, 80)}
                  transform={
                    l.rotation
                      ? `rotate(${l.rotation} ${cx} ${cy})`
                      : undefined
                  }
                  style={{ overflow: "visible" }}
                >
                  <InlineTextEditor
                    layer={l}
                    commit={commit}
                    onExit={() => setEditingId(null)}
                  />
                </foreignObject>
              );
            })()}
          {preview}
          {/* Single-layer selection shows full handles; multi-select shows a
              union outline only (group transform handles come in a later
              milestone). */}
          {selectedLayers.length === 1 && (
            <SelectionOverlay
              layer={selected}
              onHandle={startHandleDrag}
              onRotate={startRotateDrag}
            />
          )}
          {selectedLayers.length > 1 && (
            <MultiSelectionOutline layers={selectedLayers} />
          )}
          {marquee &&
            (() => {
              const x = Math.min(marquee.start.x, marquee.current.x);
              const y = Math.min(marquee.start.y, marquee.current.y);
              const w = Math.abs(marquee.current.x - marquee.start.x);
              const h = Math.abs(marquee.current.y - marquee.start.y);
              return (
                <rect
                  className="marquee"
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="rgba(148, 219, 255, 0.18)"
                  stroke="#1b1b1b"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              );
            })()}
        </svg>
        {dropping && (
          <div className="editor__drop-overlay">DROP SVG FILES TO PLACE</div>
        )}
      </main>

      <aside className="editor__panel panel">
        <div className="panel__header">
          <div className="panel__label">Layers</div>
          <div className="panel__count">{layers.length}</div>
        </div>
        <ul className="panel__list">
          {[...layers]
            .slice()
            .reverse()
            .map((l) => (
              <li
                key={l.id}
                className={`panel__item${selectedIds.has(l.id) ? " panel__item--active" : ""}`}
                onClick={(e) => {
                  if (e.shiftKey) selectToggle(l.id);
                  else selectOnly(l.id);
                }}
              >
                <button
                  className="panel__icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisible(l.id);
                  }}
                  title={l.visible ? "Hide" : "Show"}
                >
                  {l.visible ? "●" : "○"}
                </button>
                <button
                  className="panel__icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLocked(l.id);
                  }}
                  title={l.locked ? "Unlock" : "Lock"}
                >
                  {l.locked ? "■" : "□"}
                </button>
                <input
                  className="panel__name"
                  value={l.name}
                  onChange={(e) => renameLayer(l.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="panel__type">{l.type}</span>
                <button
                  className="panel__icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveLayer(l.id, "up");
                  }}
                  title="Bring forward"
                >
                  ↑
                </button>
                <button
                  className="panel__icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveLayer(l.id, "down");
                  }}
                  title="Send back"
                >
                  ↓
                </button>
                <button
                  className="panel__icon panel__icon--danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLayer(l.id);
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </li>
            ))}
          {!layers.length && (
            <li className="panel__empty">No layers yet. Drop an SVG or draw a shape.</li>
          )}
        </ul>
      </aside>
    </div>
  );
}

function PaintSection({
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
  // When a layer is selected, the indicator reflects its paint; swatch clicks
  // mutate that layer. With no selection, clicks adjust the defaults used for
  // new shapes.
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

// contentEditable div inside a <foreignObject> so the inline editor inherits
// the SVG's coordinate system and zoom. We set innerText imperatively once per
// session (on mount / layer change) so React re-renders don't stomp the
// cursor position; subsequent edits are reported via onInput.
function InlineTextEditor({ layer, commit, onExit }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerText !== layer.text) el.innerText = layer.text;
    el.focus();
    // Place the caret at the end of the text.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id]);
  const align = { start: "left", middle: "center", end: "right" }[
    layer.textAlign
  ] ?? "left";
  return (
    <div
      xmlns="http://www.w3.org/1999/xhtml"
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => {
        const text = e.currentTarget.innerText.replace(/\n$/, "");
        const m = measureTextLayer(layer, { text });
        commit((prev) =>
          prev.map((l) =>
            l.id === layer.id
              ? { ...l, text, width: m.width, height: m.height }
              : l,
          ),
        );
      }}
      onBlur={onExit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onExit();
        }
      }}
      style={{
        outline: "1px dashed #cc4722",
        outlineOffset: "-1px",
        padding: 0,
        fontSize: layer.fontSize,
        fontFamily: layer.fontFamily,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle ?? "normal",
        letterSpacing: `${layer.letterSpacing ?? 0}px`,
        lineHeight: layer.lineHeight ?? TEXT_LINE_HEIGHT,
        color: layer.fillGradient ? layer.fillGradient.from : layer.fill,
        textAlign: align,
        whiteSpace: "pre-wrap",
        cursor: "text",
        background: "transparent",
        minWidth: "1em",
        display: "inline-block",
      }}
    />
  );
}

function NumField({ label, value, onChange }) {
  return (
    <label className="sidebar__field">
      <span className="sidebar__field-label">{label}</span>
      <input
        className="sidebar__field-input"
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

function LayerNode({ layer, selected }) {
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
  // Gradient fills are referenced by url(#…); the <defs> is emitted inline as
  // a fragment sibling of the rendered shape.
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

function SelectionOverlay({ layer, onHandle, onRotate }) {
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
function MultiSelectionOutline({ layers }) {
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

export default App;
