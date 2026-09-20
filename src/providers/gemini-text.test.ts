import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateJsonWithImages } from "./gemini-text.js";

const originalKey = process.env.GEMINI_API_KEY;
beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });
afterEach(() => { vi.unstubAllGlobals(); if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; });

function stubFetch(): { calls: unknown[] } {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }) };
  }));
  return { calls };
}

it("gives a captioned image its own text part immediately before it, uncaptioned images unchanged", async () => {
  const { calls } = stubFetch();
  await generateJsonWithImages("Main prompt", [
    { mimeType: "image/png", data: "aaa", caption: "Canon reference image for \"Jesus\":" },
    { mimeType: "image/png", data: "bbb" }
  ], { type: "object", properties: {} });
  const parts = (calls[0] as { contents: Array<{ parts: unknown[] }> }).contents[0]!.parts;
  expect(parts).toEqual([
    { text: "Main prompt" },
    { text: "Canon reference image for \"Jesus\":" },
    { inlineData: { mimeType: "image/png", data: "aaa" } },
    { inlineData: { mimeType: "image/png", data: "bbb" } }
  ]);
});

it("never leaks a caption field into the inlineData part Gemini receives", async () => {
  const { calls } = stubFetch();
  await generateJsonWithImages("Prompt", [{ mimeType: "image/png", data: "aaa", caption: "Should not appear inline" }], { type: "object", properties: {} });
  const parts = (calls[0] as { contents: Array<{ parts: Array<Record<string, unknown>> }> }).contents[0]!.parts;
  const imagePart = parts.find(p => "inlineData" in p)!;
  expect(Object.keys(imagePart.inlineData as object)).toEqual(["mimeType", "data"]);
});
