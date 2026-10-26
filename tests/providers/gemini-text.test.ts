import { afterEach, expect, it, vi } from "vitest";
import { generateJsonWithImagesMetered } from "../../src/providers/gemini-text.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("sends requested video sampling on the video part and retains captions and metered usage", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    candidates: [{ content: { parts: [{ text: '{"checked":true}' }] } }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, totalTokenCount: 1100 }
  }) });
  vi.stubGlobal("fetch", fetch);
  const result = await generateJsonWithImagesMetered("Inspect the actual speech", [
    { mimeType: "video/mp4", data: "video", caption: "Native-size speaking excerpts", videoMetadata: { fps: 4 } },
    { mimeType: "image/png", data: "portrait", caption: "Approved identity" }
  ], { type: "object" });
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body.contents[0].parts).toEqual([
    { text: "Inspect the actual speech" }, { text: "Native-size speaking excerpts" },
    { inlineData: { mimeType: "video/mp4", data: "video" }, videoMetadata: { fps: 4 } },
    { text: "Approved identity" }, { inlineData: { mimeType: "image/png", data: "portrait" } }
  ]);
  expect(result).toEqual({ result: { checked: true }, usage: {
    promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 0, totalTokenCount: 1100
  }, costUsd: 0.001125 });
});

it("allows a bounded longer response window for whole-chapter crew calls", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true,json:async()=>({
    candidates:[{content:{parts:[{text:"{}"}]}}],usageMetadata:{totalTokenCount:1}
  })}));
  const timeout=vi.spyOn(AbortSignal,"timeout");
  try{
    await generateJsonWithImagesMetered("Whole chapter",[],{type:"object"},undefined,360000);
    expect(timeout).toHaveBeenCalledWith(360000);
    await expect(generateJsonWithImagesMetered("Invalid",[],{type:"object"},undefined,360001)).rejects.toThrow(/timeout/);
  }finally{timeout.mockRestore();}
});
