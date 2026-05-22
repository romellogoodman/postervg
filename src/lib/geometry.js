// Pure geometry helpers: bbox math, hit-test rotation, snap search, polygon
// vertex generation, and gradient-line computation. No React or DOM access.

export function bboxCenter(l) {
  return { cx: l.x + l.width / 2, cy: l.y + l.height / 2 };
}

// Convert a point from screen coords to the un-rotated local space of a
// layer. Rotation is about the bbox center.
export function screenToLocal(layer, px, py) {
  const { cx, cy } = bboxCenter(layer);
  const rad = (-(layer.rotation || 0) * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  return { lx, ly };
}

// For one axis: try snapping the left edge, right edge, and center of the
// dragged layer to any of `candidates`. Returns the smallest correction (0 if
// nothing is within threshold) and the candidate line that earned the snap.
// Ties prefer the probe tested first (left > center > right) and the
// candidate tested first, so the rendered guide is deterministic.
export function snapAxis(pos, size, candidates, threshold) {
  let bestDelta = 0;
  let bestGuide = null;
  let bestAbs = Infinity;
  // Probe the left edge first so it wins on perfect alignment to another
  // layer's left edge, which is the most intuitive result.
  const probes = [pos, pos + size / 2, pos + size];
  for (const p of probes) {
    for (const c of candidates) {
      const d = c - p;
      const abs = Math.abs(d);
      if (abs < threshold && abs < bestAbs) {
        bestAbs = abs;
        bestDelta = d;
        bestGuide = c;
      }
    }
  }
  return { delta: bestDelta, guide: bestGuide };
}

// Map a 0..359° angle to the linear-gradient vector in bounding-box units.
// angle=0 is left→right, 90 is top→bottom — the web convention (note that
// SVG y increases downward). The start/end line is centered on the bbox in
// objectBoundingBox units.
export function gradientLine(angle) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

// Compute `<polygon points="...">` coordinates for a regular polygon or star
// inscribed in the layer's bbox. `starRatio` < 1 alternates outer/inner
// radii to form a star; 1 is a regular polygon. First vertex points up.
export function polygonPoints(layer) {
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
