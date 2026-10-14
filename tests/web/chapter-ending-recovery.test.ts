import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ChapterEndingPlanView } from "../../src/web/ChapterEndingPlanView.js";

it("opens a saved legacy beats-based ending without fabricating status or changing producer history", () => {
  const saved = { nextChapterRef: "Mark 5:1", sourceClockEndMs: 515754, editorialDurationMs: 1000, constraints: ["Retain the complete recording"], beats: [{ purpose: "Saved visual handoff" }] };
  const before = JSON.stringify(saved);
  const html = renderToStaticMarkup(React.createElement(ChapterEndingPlanView, { plan: saved }));
  expect(html).toContain("Saved chapter ending record");
  expect(html).toContain("Retain the complete recording");
  expect(html).not.toContain("Chapter ending — proposed");
  expect(JSON.stringify(saved)).toBe(before);
});
it("retains the normal current-plan display and review notes", () => {
  const html = renderToStaticMarkup(React.createElement(ChapterEndingPlanView, { plan: { nextChapterRef: null, sourceClockEndMs: 1000, postSourceDurationMs: 2000, shots: [], reasoning: "Saved reasoning", status: "needs_review", reviewNotes: ["Target review remains required"] } }));
  expect(html).toContain("Chapter ending — needs review");
  expect(html).toContain("Target review remains required");
});
