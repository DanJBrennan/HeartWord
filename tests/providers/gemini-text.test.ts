import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { generateJsonWithImagesMetered, geminiJsonRequestBody, uploadGeminiReviewFile, getGeminiReviewFile, deleteGeminiReviewFile, verifyGeminiUploadedFile, type GeminiUploadedFile } from "../../src/providers/gemini-text.js";

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

const bytes = Buffer.from("actual reviewed video bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const expected = {sha256:digest,mimeType:"video/mp4",sizeBytes:bytes.length};
function uploaded(state:GeminiUploadedFile["state"]="ACTIVE"):GeminiUploadedFile {
  return {name:"files/review-123",uri:"https://generativelanguage.googleapis.com/v1beta/files/review-123",mimeType:"video/mp4",sizeBytes:String(bytes.length),sha256Hash:createHash("sha256").update(bytes).digest("base64"),state,expirationTime:new Date(Date.now()+86400000).toISOString()};
}
it("sends an attached video and inline canon together without changing sampling, labels, model or receipts",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-only");
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"clear":true}'}]}}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:100,totalTokenCount:1100}})});vi.stubGlobal("fetch",fetch);
  const result=await generateJsonWithImagesMetered("Review",[{mimeType:"video/mp4",fileUri:uploaded().uri,caption:"Exact original selected pictures",videoMetadata:{fps:24}},{mimeType:"image/png",data:"canon",caption:"Current BODY"}],{type:"object"},undefined,{maxOutputTokens:8192,thinkingLevel:"low"});
  const body=JSON.parse(fetch.mock.calls[0]![1].body);
  expect(fetch.mock.calls[0]![0]).toContain("gemini-3.6-flash:generateContent");
  expect(body.contents[0].parts).toEqual([{text:"Review"},{text:"Exact original selected pictures"},{fileData:{mimeType:"video/mp4",fileUri:uploaded().uri},videoMetadata:{fps:24}},{text:"Current BODY"},{inlineData:{mimeType:"image/png",data:"canon"}}]);
  expect(body.generationConfig).toMatchObject({maxOutputTokens:8192,thinkingConfig:{thinkingLevel:"LOW"}});
  expect(result.costUsd).toBe(.001125);expect(result.result).toEqual({clear:true});
});
it("rejects base64-expanded requests before any generation fetch",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-only");const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  const data=Buffer.alloc(15_000_000).toString("base64");
  await expect(generateJsonWithImagesMetered("Review",[{mimeType:"video/mp4",data}],{type:"object"})).rejects.toThrow(/encoded request exceeds/);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  {mimeType:"video/mp4"},
  {mimeType:"video/mp4",data:"",fileUri:uploaded().uri},
  {mimeType:"video/mp4",data:"bytes",fileUri:uploaded().uri},
  {mimeType:"video/mp4",fileUri:"https://example.com/files/review-123"},
  {mimeType:"video/mp4",fileUri:uploaded().uri+"?key=other"}
])("rejects ambiguous or external attachment inputs",input=>{
  expect(()=>geminiJsonRequestBody("Review",[input as never],{type:"object"})).toThrow(/exactly one/);
});
it("uploads the exact bytes once without invoking a model and verifies returned content metadata",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-only");const fetch=vi.fn().mockResolvedValueOnce({ok:true,headers:new Headers({"x-goog-upload-url":"https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=private"})}).mockResolvedValueOnce({ok:true,json:async()=>({file:uploaded("PROCESSING")})});vi.stubGlobal("fetch",fetch);
  const file=await uploadGeminiReviewFile(bytes,"video/mp4","Mark6 exact review");
  expect(file.state).toBe("PROCESSING");expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]![1].headers).toMatchObject({"x-goog-api-key":"test-only","X-Goog-Upload-Header-Content-Length":String(bytes.length)});
  expect(Buffer.from(fetch.mock.calls[1]![1].body)).toEqual(bytes);
  expect(fetch.mock.calls.every(c=>!String(c[0]).includes("generateContent"))).toBe(true);
});
it("does not finalize an upload to a redirected or foreign host",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-only");const fetch=vi.fn().mockResolvedValue({ok:true,headers:new Headers({"x-goog-upload-url":"https://example.com/upload/v1beta/files"})});vi.stubGlobal("fetch",fetch);
  await expect(uploadGeminiReviewFile(bytes,"video/mp4","Review")).rejects.toThrow(/Untrusted/);expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  {sha256Hash:Buffer.alloc(32).toString("base64")}, {sizeBytes:"999"}, {mimeType:"image/png"},
  {state:"UNKNOWN"}, {expirationTime:"2000-01-01T00:00:00Z"}, {uri:"https://example.com/review"}
])("holds changed, expired or unverified file metadata",change=>{
  expect(()=>verifyGeminiUploadedFile({...uploaded(),...change},expected)).toThrow(/metadata|hash/);
});
it("recognizes the observed base64 ASCII-hex digest without weakening byte identity",()=>{
  const actualEncoding=Buffer.from(digest,"ascii").toString("base64");
  expect(verifyGeminiUploadedFile({...uploaded(),sha256Hash:actualEncoding},expected).sha256Hash).toBe(actualEncoding);
  expect(()=>verifyGeminiUploadedFile({...uploaded(),sha256Hash:Buffer.from("0".repeat(64)).toString("base64")},expected)).toThrow(/hash differs/);
  expect(()=>verifyGeminiUploadedFile({...uploaded(),sha256Hash:actualEncoding+"!"},expected)).toThrow(/hash encoding/);
});
it("polls only the existing attachment and deletes only its exact resource",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-only");const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>uploaded()}).mockResolvedValueOnce({ok:true});vi.stubGlobal("fetch",fetch);
  const active=await getGeminiReviewFile(uploaded("PROCESSING"),expected);expect(active.state).toBe("ACTIVE");
  await deleteGeminiReviewFile(active);
  expect(fetch.mock.calls.map(c=>String(c[0]))).toEqual([active.uri,active.uri]);expect(fetch.mock.calls[1]![1].method).toBe("DELETE");
});
