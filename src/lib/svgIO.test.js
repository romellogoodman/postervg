import { describe, expect, it } from "vitest";

import {
  parseSvgFile,
  sanitizeImportedLayer,
  sanitizeRootAttrs,
  sanitizeSvgMarkup,
  serializeLayerToSvg,
} from "./svgIO.js";

describe("parseSvgFile", () => {
  it("returns null for markup without an <svg> root", () => {
    expect(parseSvgFile("<div>nope</div>")).toBeNull();
  });

  it("reads the viewBox and inner markup", () => {
    const r = parseSvgFile(
      '<svg viewBox="0 0 50 40"><rect width="10" height="10"/></svg>',
    );
    expect(r).not.toBeNull();
    expect(r.viewBox).toBe("0 0 50 40");
    expect(r.innerHtml).toContain("rect");
  });

  it("falls back to width/height when viewBox is absent", () => {
    const r = parseSvgFile('<svg width="120" height="80"><g/></svg>');
    expect(r.viewBox).toBe("0 0 120 80");
    expect(r.naturalW).toBe(120);
    expect(r.naturalH).toBe(80);
  });

  it("strips script elements and event-handler attributes on import", () => {
    const r = parseSvgFile(
      '<svg viewBox="0 0 10 10" onload="alert(1)">' +
        '<image href="x" onerror="alert(2)"/>' +
        "<script>alert(3)</script></svg>",
    );
    expect(r.innerHtml).not.toContain("onerror");
    expect(r.innerHtml.toLowerCase()).not.toContain("<script");
    expect(JSON.stringify(r.rootAttrs)).not.toContain("onload");
  });
});

describe("sanitizeSvgMarkup", () => {
  it("removes inline event handlers", () => {
    const out = sanitizeSvgMarkup('<rect onclick="evil()" width="5"/>');
    expect(out).not.toContain("onclick");
  });
});

describe("sanitizeRootAttrs", () => {
  it("drops on* and javascript: attributes but keeps presentation ones", () => {
    const out = sanitizeRootAttrs({
      onload: "x()",
      fill: "red",
      "xlink:href": "javascript:alert(1)",
    });
    expect(out).toEqual({ fill: "red" });
  });
});

describe("sanitizeImportedLayer", () => {
  it("sanitizes svg-type layer markup", () => {
    const layer = sanitizeImportedLayer({
      type: "svg",
      svgContent: '<image href="x" onerror="alert(1)"/>',
      rootAttrs: { onload: "x()", fill: "blue" },
    });
    expect(layer.svgContent).not.toContain("onerror");
    expect(layer.rootAttrs).toEqual({ fill: "blue" });
  });

  it("passes non-svg layers through unchanged", () => {
    const rect = { type: "rect", x: 1, y: 2 };
    expect(sanitizeImportedLayer(rect)).toBe(rect);
  });
});

describe("serializeLayerToSvg", () => {
  const base = { visible: true, rotation: 0 };

  it("returns empty string for a hidden layer", () => {
    expect(serializeLayerToSvg({ ...base, visible: false, type: "rect" })).toBe(
      "",
    );
  });

  it("serializes a rect with its fill", () => {
    const out = serializeLayerToSvg({
      ...base,
      type: "rect",
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      fill: "#abc",
    });
    expect(out).toContain("<rect");
    expect(out).toContain('fill="#abc"');
  });

  it("escapes special characters in text content", () => {
    const out = serializeLayerToSvg({
      ...base,
      type: "text",
      x: 0,
      y: 0,
      text: "a<b>&c",
      fontSize: 12,
      fontFamily: "Arial",
      fontWeight: 400,
      textAlign: "start",
    });
    expect(out).toContain("&lt;b&gt;");
    expect(out).toContain("&amp;c");
    expect(out).not.toContain("<b>");
  });
});
