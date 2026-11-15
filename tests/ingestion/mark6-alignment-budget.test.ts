import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ price: .001, missingUsage: false, failed: false, terminal: false, meteredMalformed: false, requests: vi.fn() }));
vi.mock("../../src/providers/gemini-text.js", async (importOriginal) => { const actual=await importOriginal<typeof import("../../src/providers/gemini-text.js")>();return { ...actual, generateJsonWithImagesMetered: async (...args: any[]) => {
  state.requests(...args);
  if(state.meteredMalformed){throw new actual.GeminiResponseError("Malformed fixture",{model:"gemini-3.6-flash",finishReason:"MAX_TOKENS",rawText:"{",costUsd:.001,usage:{promptTokenCount:1000,candidatesTokenCount:10,thoughtsTokenCount:0,totalTokenCount:1010}});}
  if(state.terminal && state.requests.mock.calls.length===2) throw new Error("Gemini's response wasn't valid JSON despite responseSchema: truncated -- raw: {");
  if (state.failed) throw new Error("lost fake-credential response");
  return { result: { isScripture: true, span: "MARKUS 6" }, costUsd: state.price,
    usage: { promptTokenCount: 1000, candidatesTokenCount: 10, thoughtsTokenCount: 0, totalTokenCount: state.missingUsage ? 0 : 1010 } };
} }; });
vi.mock("../../src/pipeline/ingestion/parse-source-text.js", () => ({ parseNarratedParagraphTitles: () => [] }));
vi.mock("../../src/pipeline/ingestion/gemini-alignment.js", () => ({
  alignmentKey: () => "fixture-source-hash", alignmentIdentificationPrompt: (context: string) => `Reference: ${context}`,
  ALIGNMENT_IDENTIFICATION_SCHEMA: { type: "object", properties: { isScripture: { type: "boolean" } } },
  alignWithGemini: async (input: any) => {
    for (let i = 0; i < 4; i++) try { await input.identify(Buffer.from("fixture-audio"), "exact supplied title", i < 2 ? input.config.fastModel : input.config.strongModel); } catch { /* Match stage's retained-unresolved behavior. */ }
    return { coverage: 0, uncoveredVerses: [1], segments: [] };
  }
}));
let previousArgv: string[], root: string, packet: string, output: string;
beforeEach(() => {
  previousArgv = process.argv; vi.resetModules(); state.requests.mockClear(); state.price = .001; state.failed = false; state.terminal=false;state.meteredMalformed=false; state.missingUsage = false;
  vi.stubEnv("GEMINI_API_KEY", "fake-credential"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
  root = mkdtempSync(join(tmpdir(), "hw-mark6-budget-")); output = join(root, "alignment"); packet = join(root, "packet.json");
  const files = Object.fromEntries(["hatam", "english", "audio"].map(name => { const path = join(root, name); writeFileSync(path, name); return [name, path]; }));
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  writeFileSync(packet, JSON.stringify({ project: { language: "hatam", book: "mark", chapter: 6 }, bodyCoverage: { complete: true },
    input: { ...files, sourceHashes: { hatam: hash(files.hatam!), reference: hash(files.english!), audio: hash(files.audio!) } },
    verses: [], printedChapterTitle: "MARKUS 6", durationMs: 3000, alignmentPreflight: { fastCalls: 2, maximumStrongCalls: 2, gaps: [] } }));
});
afterEach(() => { process.argv = previousArgv; vi.unstubAllEnvs(); vi.useRealTimers(); });
async function run(execute = false, maximum = "10", recover=false) {
  process.argv = ["node", "mark6-alignment.ts", "--packet", packet, "--output", output, "--max-usd", maximum, ...(execute ? ["--execute"] : []), ...(recover?["--recover-terminal-json"]:[])];
  vi.resetModules(); await import("../../scripts/mark6-alignment.js");
}
const journal = () => JSON.parse(readFileSync(join(output, "execution.json"), "utf8"));
describe("isolated Mark 6 alignment spending", () => {
  it("prepares a concrete proposal without submitting and refuses a second execution", async () => {
    await run(); expect(state.requests).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(output, "plan.json"), "utf8")).status).toBe("prepared_not_authorized");
    await run(true); expect(state.requests).toHaveBeenCalledTimes(4);
    expect(journal()).toMatchObject({ status: "completed_provisional", approvedMaximumUsd: 10, spentEstimatedUsd: .004, uncertainUpperBoundUsd: 0 });
    expect(state.requests.mock.calls[0]![4]).toEqual({ maxOutputTokens: 2048 });
    await expect(run(true)).rejects.toThrow("no automatic retry");
  });
  it("stops before another request would exceed the fresh ceiling", async () => {
    await run(); state.price = .02; await run(true, ".03");
    expect(state.requests).toHaveBeenCalledTimes(1);
    expect(journal()).toMatchObject({ status: "held_budget_limit", spentEstimatedUsd: .02, uncertainUpperBoundUsd: 0 });
  });
  it("keeps an unknown charge reserved and suppresses subsequent requests after a lost response", async () => {
    await run(); state.failed = true; await run(true);
    expect(state.requests).toHaveBeenCalledTimes(1);
    expect(journal()).toMatchObject({ status: "held_uncertain_submission", uncertainUpperBoundUsd: .03 });
    expect(readFileSync(join(output, "execution.json"), "utf8")).not.toContain("fake-credential");
  });
  it("replays completed evidence without payment and reserves a legacy terminal reply while continuing only unsubmitted requests",async()=>{
    await run(); state.terminal=true; await run(true);
    expect(state.requests).toHaveBeenCalledTimes(2);
    expect(journal()).toMatchObject({spentEstimatedUsd:.001,uncertainUpperBoundUsd:.03});
    await run(true,"10",true);
    expect(state.requests).toHaveBeenCalledTimes(4);
    expect(journal()).toMatchObject({status:"completed_provisional",spentEstimatedUsd:.003,uncertainUpperBoundUsd:.03});
    expect(journal().calls[1].status).toBe("terminal_json_unusable_unreported_cost");
    expect(state.requests.mock.calls[2]![4]).toEqual({maxOutputTokens:4096,thinkingLevel:"low"});
    expect(existsSync(join(output,"execution-before-recovery.json"))).toBe(true);
  });
  it("counts a metered unusable terminal reply and continues planned work without duplicating it",async()=>{
    await run();state.meteredMalformed=true;await run(true);
    expect(state.requests).toHaveBeenCalledTimes(4);
    expect(journal()).toMatchObject({status:"completed_provisional",spentEstimatedUsd:.004,uncertainUpperBoundUsd:0});
    expect(journal().calls.every((call:any)=>call.status==="terminal_json_unusable_metered")).toBe(true);
  });
  it("refuses to reconcile an uncertain transport error as terminal output",async()=>{
    await run();state.failed=true;await run(true);
    await expect(run(true,"10",true)).rejects.toThrow("known-terminal");
    expect(state.requests).toHaveBeenCalledTimes(1);
  });
  it("never treats missing usage as free and detects source changes before execution", async () => {
    await run(); state.missingUsage = true; await run(true);
    expect(state.requests).toHaveBeenCalledTimes(1); expect(journal().uncertainUpperBoundUsd).toBe(.03);
    writeFileSync(join(root, "audio"), "changed source");
    await expect(run(true)).rejects.toThrow("Pinned audio source changed");
  });
});
