import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";

import {
  BLEND_OPTIONS,
  CANVAS_PRESETS,
  DEFAULT_CANVAS_BG,
  DEFAULT_CANVAS_H,
  DEFAULT_CANVAS_W,
  DRAFT_STORAGE_KEY,
  FONT_FAMILIES,
  FONT_FAMILY_BY_ID,
  GRID_PRESETS,
  SNAP_THRESHOLD,
  TEXT_LINE_HEIGHT,
  TOOLS,
} from "./constants.js";
import { nextId } from "./lib/id.js";
import {
  bboxCenter,
  polygonPoints,
  screenToLocal,
  snapAxis,
} from "./lib/geometry.js";
import {
  fontPresetForLayer,
  measureTextLayer,
} from "./lib/text.js";
import {
  defaultLayerForShape,
  defaultTextLayer,
  layerOpacity,
  serializeGradientDef,
} from "./lib/layers.js";
import { parseSvgFile, serializeLayerToSvg } from "./lib/svgIO.js";
import { InlineTextEditor } from "./components/InlineTextEditor.jsx";
import { LayerNode } from "./components/LayerNode.jsx";
import { NumField } from "./components/NumField.jsx";
import { PaintSection } from "./components/PaintSection.jsx";
import { RepeatSection } from "./components/RepeatSection.jsx";
import {
  MultiSelectionOutline,
  SelectionOverlay,
} from "./components/SelectionOverlay.jsx";

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
  const [canvasW, setCanvasW] = useState(DEFAULT_CANVAS_W);
  const [canvasH, setCanvasH] = useState(DEFAULT_CANVAS_H);
  const [canvasBg, setCanvasBg] = useState(DEFAULT_CANVAS_BG);
  const [gridSize, setGridSize] = useState(0);
  // Transient smart-guide lines shown while dragging a layer. Cleared on
  // pointerup. Each entry is { axis: 'x' | 'y', value: number }.
  const [activeGuides, setActiveGuides] = useState([]);
  // History: past/future hold snapshots of `layers`. Selection is UI state
  // and is deliberately not undoable.
  const [, setPast] = useState([]);
  const [, setFuture] = useState([]);
  const svgRef = useRef(null);
  // Track the latest layers synchronously so imperative helpers (commit,
  // undo, drag snapshots) can read without stale closures.
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  // Snapshot of `layers` taken at the start of a drag/resize/rotate so we
  // can push a single history entry on pointerup instead of one per frame.
  const dragSnapshotRef = useRef(null);

  const selectedLayers = useMemo(
    () => layers.filter((l) => selectedIds.has(l.id)),
    [layers, selectedIds],
  );
  // Back-compat alias: the "primary" selection drives the Properties panel,
  // PaintSection target, and single-layer overlay handles.
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
      } else if (k === "c" && mod) {
        if (selectedIds.size) {
          e.preventDefault();
          // Postervg-native clipboard payload: JSON with a marker field.
          // Pasting back into the editor re-hydrates layers with fresh ids;
          // pasting into another app reads the prettified JSON, which is
          // acceptable collateral for a prototype.
          const payload = JSON.stringify({
            _postervg: 1,
            layers: layers.filter((l) => selectedIds.has(l.id)),
          });
          navigator.clipboard?.writeText(payload).catch(() => {});
        }
      } else if (k === "v" && mod) {
        e.preventDefault();
        (async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            // Try native payload first; fall back to raw SVG.
            let newLayers = null;
            try {
              const parsed = JSON.parse(text);
              if (parsed && parsed._postervg && Array.isArray(parsed.layers)) {
                newLayers = parsed.layers.map((l) => ({
                  ...l,
                  id: nextId(),
                  x: (l.x ?? 0) + 20,
                  y: (l.y ?? 0) + 20,
                }));
              }
            } catch {
              // not JSON; fall through
            }
            if (!newLayers && text.trim().startsWith("<")) {
              const parsed = parseSvgFile(text);
              if (parsed) {
                const w = Math.min(parsed.naturalW, 400);
                const h = Math.min(parsed.naturalH, 400);
                newLayers = [
                  {
                    id: nextId(),
                    type: "svg",
                    name: "Pasted SVG",
                    visible: true,
                    locked: false,
                    x: (canvasW - w) / 2,
                    y: (canvasH - h) / 2,
                    width: w,
                    height: h,
                    rotation: 0,
                    opacity: 1,
                    blendMode: "normal",
                    viewBox: parsed.viewBox,
                    svgContent: parsed.innerHtml,
                    rootAttrs: parsed.rootAttrs,
                  },
                ];
              }
            }
            if (newLayers && newLayers.length) {
              commit((prev) => [...prev, ...newLayers]);
              selectMany(newLayers.map((l) => l.id));
            }
          } catch {
            // Clipboard read may be blocked — silent no-op.
          }
        })();
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
  }, [
    selectedIds,
    layers,
    commit,
    clearSelection,
    selectMany,
    undo,
    redo,
    editingId,
    canvasW,
    canvasH,
  ]);

  // Pointer handling on the SVG canvas
  const handleCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    const hitLayerId = e.target.closest("[data-layer-id]")?.dataset?.layerId;

    if (tool === "select") {
      if (hitLayerId) {
        const l = layers.find((x) => x.id === hitLayerId);
        if (!l || l.locked) return;
        // Shift-click toggles membership; plain click on a non-selected
        // layer replaces the selection. Clicking an already-selected layer
        // keeps the whole set so the user can drag a group.
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
        let dx = pt.x - drag.startPointer.x;
        let dy = pt.y - drag.startPointer.y;
        // Snap the primary dragged layer's position to either a smart guide
        // (another layer's edge / center, or a canvas midline) or the grid.
        // Smart guides take precedence; grid is the fallback.
        const sl = drag.startLayers[0];
        if (sl) {
          const nx = sl.x + dx;
          const ny = sl.y + dy;
          const others = layers.filter(
            (l) => !drag.layerIds.includes(l.id),
          );
          const xCandidates = [
            0,
            canvasW / 2,
            canvasW,
            ...others.flatMap((l) => [l.x, l.x + l.width / 2, l.x + l.width]),
          ];
          const yCandidates = [
            0,
            canvasH / 2,
            canvasH,
            ...others.flatMap((l) => [l.y, l.y + l.height / 2, l.y + l.height]),
          ];
          const xSnap = snapAxis(nx, sl.width, xCandidates, SNAP_THRESHOLD);
          const ySnap = snapAxis(ny, sl.height, yCandidates, SNAP_THRESHOLD);
          dx += xSnap.delta;
          dy += ySnap.delta;
          if (gridSize > 0) {
            // Grid fallback — only snap axes the smart guides didn't already
            // catch, so alignment to other shapes wins over alignment to
            // the grid.
            if (xSnap.guide == null) {
              const snapped = Math.round((sl.x + dx) / gridSize) * gridSize;
              dx = snapped - sl.x;
            }
            if (ySnap.guide == null) {
              const snapped = Math.round((sl.y + dy) / gridSize) * gridSize;
              dy = snapped - sl.y;
            }
          }
          const guides = [];
          if (xSnap.guide != null) guides.push({ axis: "x", value: xSnap.guide });
          if (ySnap.guide != null) guides.push({ axis: "y", value: ySnap.guide });
          setActiveGuides(guides);
        }
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
        // For text layers, resize handles scale font-size uniformly instead
        // of stretching the bbox independently. We derive the scale from
        // whichever axis the active handle drives, then re-measure to snap
        // the bbox to the new content extent.
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
          // Anchor to the opposite edge from the handle so the grabbed
          // corner tracks the pointer.
          nx = h.includes("w") ? sl.x + sl.width - nw : sl.x;
          ny = h.includes("n") ? sl.y + sl.height - nh : sl.y;
        }
        // Keep center stable under rotation when top-left changes. Recompute
        // the original center and new center; shift so rotated center stays
        // put.
        if (sl.rotation) {
          const oldCx = sl.x + sl.width / 2;
          const oldCy = sl.y + sl.height / 2;
          const newCxLocal = nx + nw / 2;
          const newCyLocal = ny + nh / 2;
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
    if (activeGuides.length) setActiveGuides([]);
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

  // Align every selected layer to a shared edge of the selection's union
  // bbox.
  const alignSelected = (edge) => {
    if (selectedLayers.length < 2) return;
    const sel = selectedLayers;
    const minX = Math.min(...sel.map((l) => l.x));
    const maxX = Math.max(...sel.map((l) => l.x + l.width));
    const minY = Math.min(...sel.map((l) => l.y));
    const maxY = Math.max(...sel.map((l) => l.y + l.height));
    const setX = {
      left: () => minX,
      hcenter: (w) => (minX + maxX) / 2 - w / 2,
      right: (w) => maxX - w,
    };
    const setY = {
      top: () => minY,
      vcenter: (h) => (minY + maxY) / 2 - h / 2,
      bottom: (h) => maxY - h,
    };
    commit((prev) =>
      prev.map((l) => {
        if (!selectedIds.has(l.id)) return l;
        if (edge in setX) return { ...l, x: setX[edge](l.width) };
        if (edge in setY) return { ...l, y: setY[edge](l.height) };
        return l;
      }),
    );
  };

  // Evenly redistribute the selection on one axis: keep the outer two fixed
  // and slot every layer in between at equal center-to-center spacing.
  const distributeSelected = (axis) => {
    if (selectedLayers.length < 3) return;
    const sorted = [...selectedLayers].sort((a, b) =>
      axis === "x" ? a.x - b.x : a.y - b.y,
    );
    const getC = (l) =>
      axis === "x" ? l.x + l.width / 2 : l.y + l.height / 2;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const step = (getC(last) - getC(first)) / (sorted.length - 1);
    const deltaById = new Map();
    sorted.forEach((l, i) => {
      deltaById.set(l.id, getC(first) + i * step - getC(l));
    });
    commit((prev) =>
      prev.map((l) => {
        const d = deltaById.get(l.id);
        if (d == null) return l;
        return axis === "x" ? { ...l, x: l.x + d } : { ...l, y: l.y + d };
      }),
    );
  };

  // Grid duplicate of the primary selection.
  const createArray = (cols, rows, gapX, gapY) => {
    if (!selected || selectedLayers.length !== 1) return;
    const base = selected;
    const news = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c === 0) continue;
        news.push({
          ...base,
          id: nextId(),
          x: base.x + c * (base.width + gapX),
          y: base.y + r * (base.height + gapY),
          name: `${base.name} ${r * cols + c + 1}`,
        });
      }
    }
    if (news.length) {
      commit((prev) => [...prev, ...news]);
      selectMany([base.id, ...news.map((n) => n.id)]);
    }
  };

  // Radial duplicate: place `count` copies around a circle of `radius`
  // centred on the primary selection.
  const createRadial = (count, radius, rotateWithRing) => {
    if (!selected || selectedLayers.length !== 1) return;
    const base = selected;
    const bcx = base.x + base.width / 2;
    const bcy = base.y + base.height / 2;
    const news = [];
    for (let i = 1; i < count; i++) {
      const a = (i * 2 * Math.PI) / count;
      // Keeps the original on the circle and rotates around the centre at
      // (bcx - radius, bcy).
      const cxClone = bcx + radius * (Math.cos(a) - 1);
      const cyClone = bcy + radius * Math.sin(a);
      news.push({
        ...base,
        id: nextId(),
        x: cxClone - base.width / 2,
        y: cyClone - base.height / 2,
        rotation: rotateWithRing
          ? (base.rotation ?? 0) + (a * 180) / Math.PI
          : base.rotation ?? 0,
        name: `${base.name} r${i}`,
      });
    }
    if (news.length) {
      commit((prev) => [...prev, ...news]);
      selectMany([base.id, ...news.map((n) => n.id)]);
    }
  };

  // Build the final exported SVG document as a string. Shared by the .svg
  // download and the PNG rasteriser, which draws this string into a canvas.
  const buildExportSvg = () => {
    const body = layers.map(serializeLayerToSvg).join("\n");
    // Collect distinct Google Font URLs used by any visible text layer and
    // embed them as @import in a <style> block so downstream SVG viewers
    // render with the intended typography even without the font installed
    // locally.
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
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}">
${defsBlock}<rect width="${canvasW}" height="${canvasH}" fill="${canvasBg}"/>
${body}
</svg>`;
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const doExport = () => {
    const svg = buildExportSvg();
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "postervg.svg");
  };

  // Rasterise the SVG string into a PNG by round-tripping through an
  // <img> + <canvas>. Works entirely client-side. Known limitation: fonts
  // loaded via @import may not render if the browser hasn't fetched them by
  // the time drawImage runs; preloading via document.fonts.ready helps.
  const doExportPng = async () => {
    const svgString = buildExportSvg();
    try {
      if (document.fonts?.ready) await document.fonts.ready;
    } catch {
      // ignore
    }
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, "postervg.png");
          resolve();
        }, "image/png");
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const doClear = () => {
    if (!layers.length) return;
    if (window.confirm("Clear all layers?")) {
      commit([]);
      clearSelection();
      // Clear the autosaved draft too so a reload doesn't resurrect what
      // the user just deleted.
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  // Hydrate the one-slot draft on mount. We do this in an effect (not in
  // useState initialisers) so a parse failure doesn't crash the first
  // render.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.layers)) setLayers(saved.layers);
      if (typeof saved.canvasW === "number") setCanvasW(saved.canvasW);
      if (typeof saved.canvasH === "number") setCanvasH(saved.canvasH);
      if (typeof saved.canvasBg === "string") setCanvasBg(saved.canvasBg);
      if (typeof saved.gridSize === "number") setGridSize(saved.gridSize);
    } catch {
      // Corrupt draft — drop it silently rather than blocking startup.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave after quiet for 400ms so rapid edits (sliders, drags) don't
  // hammer localStorage. Persists the full document state minus transient
  // UI (selection, editingId, history).
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({ layers, canvasW, canvasH, canvasBg, gridSize }),
        );
      } catch {
        // quota or disabled storage — silently skip
      }
    }, 400);
    return () => clearTimeout(h);
  }, [layers, canvasW, canvasH, canvasBg, gridSize]);

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
      const points = polygonPoints({
        x,
        y,
        width: w,
        height: h,
        sides: 5,
        starRatio: 1,
      });
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

        {selectedLayers.length >= 2 && (
          <div className="sidebar__section">
            <div className="sidebar__label">
              Arrange
              <span className="sidebar__label-meta">
                · {selectedLayers.length} layers
              </span>
            </div>
            <div className="sidebar__arrange">
              {[
                { id: "left", label: "⊢", title: "Align left" },
                { id: "hcenter", label: "⊣⊢", title: "Align horizontal center" },
                { id: "right", label: "⊣", title: "Align right" },
                { id: "top", label: "⊤", title: "Align top" },
                { id: "vcenter", label: "⊥⊤", title: "Align vertical center" },
                { id: "bottom", label: "⊥", title: "Align bottom" },
              ].map((b) => (
                <button
                  key={b.id}
                  className="sidebar__arrange-btn"
                  onClick={() => alignSelected(b.id)}
                  title={b.title}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div
              className="sidebar__arrange sidebar__arrange--two"
              style={{ marginTop: 6 }}
            >
              <button
                className="sidebar__arrange-btn"
                onClick={() => distributeSelected("x")}
                disabled={selectedLayers.length < 3}
                title="Distribute horizontally (needs 3+)"
              >
                DIST H
              </button>
              <button
                className="sidebar__arrange-btn"
                onClick={() => distributeSelected("y")}
                disabled={selectedLayers.length < 3}
                title="Distribute vertically (needs 3+)"
              >
                DIST V
              </button>
            </div>
          </div>
        )}

        {selectedLayers.length === 1 && (
          <RepeatSection
            selected={selected}
            onArray={createArray}
            onRadial={createRadial}
          />
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
            <label
              className="sidebar__field sidebar__field--wide"
              style={{ marginTop: 8 }}
            >
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
                value={Math.round(
                  (selected.lineHeight ?? TEXT_LINE_HEIGHT) * 100,
                )}
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
                {Math.round(
                  (selected.lineHeight ?? TEXT_LINE_HEIGHT) * 100,
                )}
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
                        l.id === selected.id ? { ...l, textAlign: a.id } : l,
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
          <div className="sidebar__label">Canvas</div>
          <label className="sidebar__field sidebar__field--wide">
            <span className="sidebar__field-label">SIZE</span>
            <select
              className="sidebar__select"
              // Match current W×H to a preset, else surface "CUSTOM".
              value={
                CANVAS_PRESETS.find(
                  (p) => p.w === canvasW && p.h === canvasH,
                )?.id ?? "custom"
              }
              onChange={(e) => {
                const preset = CANVAS_PRESETS.find(
                  (p) => p.id === e.target.value,
                );
                if (preset) {
                  setCanvasW(preset.w);
                  setCanvasH(preset.h);
                }
              }}
            >
              {CANVAS_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.w}×{p.h}
                </option>
              ))}
              <option value="custom">CUSTOM</option>
            </select>
          </label>
          <div className="sidebar__fields" style={{ marginTop: 6 }}>
            <NumField
              label="W"
              value={canvasW}
              onChange={(v) => setCanvasW(Math.max(16, Math.round(v)))}
            />
            <NumField
              label="H"
              value={canvasH}
              onChange={(v) => setCanvasH(Math.max(16, Math.round(v)))}
            />
          </div>
          <label
            className="sidebar__slider-row sidebar__bg-row"
            style={{ marginTop: 6 }}
            title="Canvas background color"
          >
            <span className="sidebar__field-label">BG</span>
            <span
              className="sidebar__bg-swatch"
              style={{ background: canvasBg }}
            />
            <span className="sidebar__slider-value">
              {canvasBg.toUpperCase()}
            </span>
            <input
              type="color"
              value={canvasBg}
              onChange={(e) => setCanvasBg(e.target.value)}
            />
          </label>
          <label
            className="sidebar__field sidebar__field--wide"
            style={{ marginTop: 6 }}
          >
            <span className="sidebar__field-label">GRID</span>
            <select
              className="sidebar__select"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
            >
              {GRID_PRESETS.map((g) => (
                <option key={g} value={g}>
                  {g === 0 ? "OFF" : `${g}PX`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sidebar__section">
          <button className="sidebar__button" onClick={doClear}>
            CLEAR
          </button>
          <button className="sidebar__button" onClick={doExport}>
            EXPORT SVG
          </button>
          <button className="sidebar__button" onClick={doExportPng}>
            EXPORT PNG
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
          viewBox={`0 0 ${canvasW} ${canvasH}`}
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
            width={canvasW}
            height={canvasH}
            fill={canvasBg}
            stroke="#1b1b1b"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {gridSize > 0 && (
            <>
              <defs>
                <pattern
                  id="pvg-grid"
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="0" cy="0" r="0.9" fill="rgba(27,27,27,0.35)" />
                </pattern>
              </defs>
              <rect
                x="0"
                y="0"
                width={canvasW}
                height={canvasH}
                fill="url(#pvg-grid)"
                pointerEvents="none"
              />
            </>
          )}
          {layers.map((l) =>
            // While inline-editing a text layer we render the editor in
            // place of the glyphs so the user doesn't see both at once.
            l.id === editingId ? null : (
              <LayerNode key={l.id} layer={l} />
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
          {activeGuides.map((g, i) =>
            g.axis === "x" ? (
              <line
                key={`gx${i}`}
                x1={g.value}
                y1={0}
                x2={g.value}
                y2={canvasH}
                stroke="#cc4722"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : (
              <line
                key={`gy${i}`}
                x1={0}
                y1={g.value}
                x2={canvasW}
                y2={g.value}
                stroke="#cc4722"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ),
          )}
          {/* Single-layer selection shows full handles; multi-select shows
              a union outline only (group transform handles come in a later
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
            <li className="panel__empty">
              No layers yet. Drop an SVG or draw a shape.
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}

export default App;
