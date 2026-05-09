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
];

let _uid = 0;
const nextId = () => `l${Date.now().toString(36)}${(_uid++).toString(36)}`;

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

function defaultLayerForShape(type, x, y, w, h, fill) {
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
            : "Layer",
    visible: true,
    locked: false,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    fill,
    stroke: "#1b1b1b",
    strokeWidth: type === "line" ? 2 : 0,
  };
  if (type === "line") {
    base.fill = "none";
    base.stroke = fill;
  }
  return base;
}

function serializeLayerToSvg(l) {
  if (!l.visible) return "";
  const { cx, cy } = bboxCenter(l);
  const rot = l.rotation
    ? ` transform="rotate(${l.rotation} ${cx} ${cy})"`
    : "";
  if (l.type === "rect") {
    return `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" fill="${l.fill}"${l.strokeWidth ? ` stroke="${l.stroke}" stroke-width="${l.strokeWidth}"` : ""}${rot}/>`;
  }
  if (l.type === "ellipse") {
    const rx = l.width / 2;
    const ry = l.height / 2;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${l.fill}"${l.strokeWidth ? ` stroke="${l.stroke}" stroke-width="${l.strokeWidth}"` : ""}${rot}/>`;
  }
  if (l.type === "line") {
    return `<line x1="${l.x}" y1="${l.y}" x2="${l.x + l.width}" y2="${l.y + l.height}" stroke="${l.stroke}" stroke-width="${l.strokeWidth}"${rot}/>`;
  }
  if (l.type === "svg") {
    const extra = l.rootAttrs ? " " + serializeAttrs(l.rootAttrs) : "";
    return `<g${rot}><svg x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" viewBox="${l.viewBox}" preserveAspectRatio="xMidYMid meet"${extra}>${l.svgContent}</svg></g>`;
  }
  return "";
}

function App() {
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState("select");
  const [fill, setFill] = useState("#1b1b1b");
  const [drawing, setDrawing] = useState(null); // { type, start, current }
  const [drag, setDrag] = useState(null); // { mode, layerId, startPointer, startLayer, handle? }
  const [dropping, setDropping] = useState(false);
  const svgRef = useRef(null);

  const selected = useMemo(
    () => layers.find((l) => l.id === selectedId) || null,
    [layers, selectedId],
  );

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
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === "v") setTool("select");
      else if (k === "r") setTool("rect");
      else if (k === "o") setTool("ellipse");
      else if (k === "l") setTool("line");
      else if (k === "escape") setSelectedId(null);
      else if (k === "backspace" || k === "delete") {
        if (selectedId) {
          setLayers((prev) => prev.filter((l) => l.id !== selectedId));
          setSelectedId(null);
        }
      } else if (k === "d" && (e.metaKey || e.ctrlKey)) {
        if (selectedId) {
          e.preventDefault();
          setLayers((prev) => {
            const i = prev.findIndex((l) => l.id === selectedId);
            if (i < 0) return prev;
            const clone = {
              ...prev[i],
              id: nextId(),
              x: prev[i].x + 16,
              y: prev[i].y + 16,
              name: prev[i].name + " copy",
            };
            return [...prev.slice(0, i + 1), clone, ...prev.slice(i + 1)];
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  // Pointer handling on the SVG canvas
  const handleCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    const hitLayerId = e.target.closest("[data-layer-id]")?.dataset?.layerId;

    if (tool === "select") {
      if (hitLayerId) {
        const l = layers.find((x) => x.id === hitLayerId);
        if (!l || l.locked) return;
        setSelectedId(hitLayerId);
        setDrag({
          mode: "move",
          layerId: hitLayerId,
          startPointer: pt,
          startLayer: { ...l },
        });
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        setSelectedId(null);
      }
      return;
    }

    // Drawing tool
    setSelectedId(null);
    setDrawing({ type: tool, start: pt, current: pt });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e) => {
    const pt = clientToSvg(e.clientX, e.clientY);
    if (drawing) {
      setDrawing((d) => (d ? { ...d, current: pt } : d));
      return;
    }
    if (drag) {
      if (drag.mode === "move") {
        const dx = pt.x - drag.startPointer.x;
        const dy = pt.y - drag.startPointer.y;
        setLayers((prev) =>
          prev.map((l) =>
            l.id === drag.layerId
              ? { ...l, x: drag.startLayer.x + dx, y: drag.startLayer.y + dy }
              : l,
          ),
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
          prev.map((l) =>
            l.id === drag.layerId
              ? { ...l, x: nx, y: ny, width: nw, height: nh }
              : l,
          ),
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
        let layer;
        if (type === "line") {
          // Line uses raw endpoints, encoded as x,y + width,height (dx,dy)
          layer = defaultLayerForShape(
            "line",
            start.x,
            start.y,
            current.x - start.x,
            current.y - start.y,
            fill,
          );
        } else {
          layer = defaultLayerForShape(
            type,
            x,
            y,
            Math.max(w, 2),
            Math.max(h, 2),
            fill,
          );
        }
        setLayers((prev) => [...prev, layer]);
        setSelectedId(layer.id);
        setTool("select");
      }
      setDrawing(null);
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
          viewBox: parsed.viewBox,
          svgContent: parsed.innerHtml,
          rootAttrs: parsed.rootAttrs,
        });
      }
      if (news.length) {
        setLayers((prev) => [...prev, ...news]);
        setSelectedId(news[news.length - 1].id);
      }
    },
    [clientToSvg],
  );

  // Layers panel ops
  const toggleVisible = (id) =>
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    );
  const toggleLocked = (id) =>
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    );
  const renameLayer = (id, name) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  const removeLayer = (id) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const moveLayer = (id, dir) => {
    setLayers((prev) => {
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
    const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>
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
      setLayers([]);
      setSelectedId(null);
    }
  };

  // In-progress shape preview
  const preview = useMemo(() => {
    if (!drawing) return null;
    const { type, start, current } = drawing;
    if (type === "line") {
      return (
        <line
          x1={start.x}
          y1={start.y}
          x2={current.x}
          y2={current.y}
          stroke={fill}
          strokeWidth="2"
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
          fill={fill}
          opacity="0.6"
          stroke="#1b1b1b"
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
          fill={fill}
          opacity="0.6"
          stroke="#1b1b1b"
          strokeDasharray="4 3"
        />
      );
    return null;
  }, [drawing, fill]);

  return (
    <div className="editor">
      <header className="editor__header">
        <div className="editor__brand">postervg</div>
        <div className="editor__hint">
          drop SVGs · draw shapes · stack in layers
        </div>
      </header>

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

        <div className="sidebar__section">
          <div className="sidebar__label">Color</div>
          <div className="sidebar__swatches">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                className={`sidebar__swatch${fill === c.value ? " sidebar__swatch--active" : ""}`}
                style={{ background: c.value }}
                onClick={() => {
                  setFill(c.value);
                  if (selected && !selected.locked) {
                    setLayers((prev) =>
                      prev.map((l) =>
                        l.id === selected.id
                          ? selected.type === "line"
                            ? { ...l, stroke: c.value }
                            : { ...l, fill: c.value }
                          : l,
                      ),
                    );
                  }
                }}
                title={c.name}
              />
            ))}
          </div>
        </div>

        {selected && (
          <div className="sidebar__section">
            <div className="sidebar__label">Properties</div>
            <div className="sidebar__fields">
              <NumField
                label="X"
                value={Math.round(selected.x)}
                onChange={(v) =>
                  setLayers((prev) =>
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
                  setLayers((prev) =>
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
                  setLayers((prev) =>
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
                  setLayers((prev) =>
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
                  setLayers((prev) =>
                    prev.map((l) =>
                      l.id === selected.id ? { ...l, rotation: v } : l,
                    ),
                  )
                }
              />
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
          {layers.map((l) => (
            <LayerNode key={l.id} layer={l} selected={l.id === selectedId} />
          ))}
          {preview}
          {selected && (
            <SelectionOverlay
              layer={selected}
              onHandle={startHandleDrag}
              onRotate={startRotateDrag}
            />
          )}
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
                className={`panel__item${l.id === selectedId ? " panel__item--active" : ""}`}
                onClick={() => setSelectedId(l.id)}
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
  const common = {
    "data-layer-id": layer.id,
    opacity: layer.visible ? 1 : 0.15,
    style: { pointerEvents: layer.locked ? "none" : "auto" },
    transform: rot,
  };
  if (layer.type === "rect") {
    return (
      <rect
        {...common}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        fill={layer.fill}
        stroke={layer.strokeWidth ? layer.stroke : "none"}
        strokeWidth={layer.strokeWidth}
      />
    );
  }
  if (layer.type === "ellipse") {
    return (
      <ellipse
        {...common}
        cx={cx}
        cy={cy}
        rx={layer.width / 2}
        ry={layer.height / 2}
        fill={layer.fill}
        stroke={layer.strokeWidth ? layer.stroke : "none"}
        strokeWidth={layer.strokeWidth}
      />
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
      />
    );
  }
  if (layer.type === "svg") {
    const extra = layer.rootAttrs ? " " + serializeAttrs(layer.rootAttrs) : "";
    const inner = `<svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="${layer.viewBox}" preserveAspectRatio="xMidYMid meet" overflow="visible"${extra}>${layer.svgContent}</svg>`;
    return <g {...common} dangerouslySetInnerHTML={{ __html: inner }} />;
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

export default App;
