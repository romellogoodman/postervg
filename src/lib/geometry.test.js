import { describe, expect, it } from "vitest";

import { polygonPoints, snapAxis } from "./geometry.js";

describe("snapAxis", () => {
  it("snaps to a candidate within the threshold", () => {
    const r = snapAxis(98, 0, [100], 6);
    expect(r.guide).toBe(100);
    expect(r.delta).toBe(2);
  });

  it("returns no snap when every candidate is outside the threshold", () => {
    const r = snapAxis(0, 0, [100], 6);
    expect(r.guide).toBeNull();
    expect(r.delta).toBe(0);
  });

  it("matches the center edge of the box", () => {
    // box left=90, width=20 -> center=100 aligns to candidate 100
    const r = snapAxis(90, 20, [100], 6);
    expect(r.guide).toBe(100);
    expect(r.delta).toBe(0);
  });

  it("picks the nearest candidate", () => {
    const r = snapAxis(100, 0, [104, 101], 6);
    expect(r.guide).toBe(101);
  });
});

describe("polygonPoints", () => {
  it("produces one point per side for a regular polygon", () => {
    const pts = polygonPoints({ x: 0, y: 0, width: 100, height: 100, sides: 5 });
    expect(pts.split(" ")).toHaveLength(5);
  });

  it("doubles the vertex count for a star (starRatio < 1)", () => {
    const pts = polygonPoints({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      sides: 5,
      starRatio: 0.5,
    });
    expect(pts.split(" ")).toHaveLength(10);
  });

  it("places the first vertex at the top center", () => {
    const pts = polygonPoints({ x: 0, y: 0, width: 100, height: 100, sides: 4 });
    const [x, y] = pts.split(" ")[0].split(",").map(Number);
    expect(x).toBeCloseTo(50, 1);
    expect(y).toBeCloseTo(0, 1);
  });

  it("clamps sides to a minimum of 3", () => {
    const pts = polygonPoints({ x: 0, y: 0, width: 10, height: 10, sides: 1 });
    expect(pts.split(" ")).toHaveLength(3);
  });
});
