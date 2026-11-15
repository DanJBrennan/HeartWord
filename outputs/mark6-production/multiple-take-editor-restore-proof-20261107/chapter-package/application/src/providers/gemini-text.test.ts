import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateJsonWithImages, generateJsonWithImagesMetered } from "./gemini-text.js";

const originalKey = process.env.GEMINI_API_KEY;
beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });
afterEach(() => { vi.unstubAllGlobals(); if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; });

function stubFetch(response?: unknown): { calls: unknown[] } {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, json: async () => response ?? { candidates: [{ content: { parts: [{ text: "{}" }] } }] } };
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

it("estimates a real USD cost from Gemini's own reported token usage, output tokens including thinking tokens", async () => {
  stubFetch({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50, totalTokenCount: 1250 } });
  const metered = await generateJsonWithImagesMetered<{ ok: boolean }>("Prompt", [], { type: "object", properties: {} });
  expect(metered.result).toEqual({ ok: true });
  expect(metered.usage).toEqual({ promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50, totalTokenCount: 1250 });
  // Public standard rates through2026-12-31: $0.75input/$3.75output per1M,
  // including thinking; the returned dollar estimate is rounded to6decimals.
  expect(metered.costUsd).toBe(0.001688);
  expect(metered.costUsd).toBeGreaterThan(0);
});

it("treats a response with no usageMetadata as zero tokens and zero cost rather than throwing", async () => {
  stubFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
  const metered = await generateJsonWithImagesMetered("Prompt", [], { type: "object", properties: {} });
  expect(metered.usage).toEqual({ promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0 });
  expect(metered.costUsd).toBe(0);
});

it("prices bounded Pro alignment fills at Pro rates including thinking instead of Flash rates",async()=>{
 stubFetch({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:200,thoughtsTokenCount:50,totalTokenCount:1250}});
 const result=await generateJsonWithImagesMetered("Prompt",[],{type:"object",properties:{}},"gemini-3.1-pro-preview",{maxOutputTokens:2048});
 expect(result.costUsd).toBe(.005);
 const request=JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
 expect(request.generationConfig.maxOutputTokens).toBe(2048);
});
it("holds unverified model pricing and invalid output limits before a paid request",async()=>{
 stubFetch({});
 await expect(generateJsonWithImagesMetered("Prompt",[],{},"unpriced-model")).rejects.toThrow("pricing must be verified");
 await expect(generateJsonWithImagesMetered("Prompt",[],{},undefined,{maxOutputTokens:100000})).rejects.toThrow("Bounded Gemini output");
 expect(fetch).not.toHaveBeenCalled();
});

it("retains reported charges and raw malformed output, and limits thinking explicitly",async()=>{
 stubFetch({candidates:[{content:{parts:[{text:'{"partial":'}]},finishReason:"MAX_TOKENS"}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:100,thoughtsTokenCount:50,totalTokenCount:1150}});
 await expect(generateJsonWithImagesMetered("Prompt",[],{},undefined,{maxOutputTokens:4096,thinkingLevel:"low"})).rejects.toMatchObject({name:"GeminiResponseError",receipt:{costUsd:.001312,finishReason:"MAX_TOKENS",rawText:'{"partial":',usage:{totalTokenCount:1150}}});
 const request=JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
 expect(request.generationConfig.thinkingConfig).toEqual({thinkingLevel:"LOW"});
});
