import { useEffect, useRef } from "react";
import { TEXT_LINE_HEIGHT } from "../constants.js";
import { measureTextLayer } from "../lib/text.js";

// contentEditable div inside a <foreignObject> so the inline editor inherits
// the SVG's coordinate system and zoom. We set innerText imperatively once
// per session (on mount / layer change) so React re-renders don't stomp the
// cursor position; subsequent edits are reported via onInput.
export function InlineTextEditor({ layer, commit, onExit }) {
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
