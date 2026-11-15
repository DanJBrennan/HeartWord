import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalA2v, generateA2vSection } from "../../src/providers/ltx/a2v.js";
import { buildRequest } from "../../scripts/experiments/ltx-lipsync.js";

afterEach(() => vi.unstubAllEnvs());
const ready = { status: "ok", models_loaded: true, active_model: "fast" };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hw-a2v-"));
  mkdirSync(join(root, "assets"));
  const image = join(root, "assets", "image.png"), audio = join(root, "assets", "speech.wav");
  writeFileSync(image, "fixture-image"); writeFileSync(audio, "fixture-audio");
  const directory = join(root, "assets", "section");
  const transport = { connect: vi.fn(async () => "http://127.0.0.1:1234"),
    remote: vi.fn(async (cmd: string) => cmd === 'printf "%s" "$HOME"' ? "/Users/fixture" : ""),
    upload: vi.fn(async () => {}), download: vi.fn(async (_remote: string, local: string) => { writeFileSync(local, "unreviewed-movie-fixture"); }), reset: vi.fn() };
  const json = vi.fn(async (_base: string, path: string) => {
    if (path === "/health") return ready;
    if (path === "/api/runtime-policy") return { force_api_generations: false };
    if (path === "/api/settings") return { userPrefersLtxApiVideoGenerations: false };
    if (path === "/api/generation/progress") return { status: "idle" };
    return { status: "complete", video_path: "/Users/fixture/output.mp4" };
  });
  return { root, directory, transport, json, input: { dataDir: root, directory, image, audio, prompt: "Approved single speaker in supplied scene", authorizeSubmission: vi.fn() } };
}
describe("local A2V section protocol", () => {
  it("rejects unverified cloud mode and permits downloaded on-demand Fast without pretending it is resident", () => {
    expect(() => assertLocalA2v(ready, { force_api_generations: true }, { userPrefersLtxApiVideoGenerations: false })).toThrow("no cloud fallback");
    expect(() => assertLocalA2v({ status: "ok", models_status: [{ id: "fast", downloaded: true }] },
      { force_api_generations: false }, { user_prefers_ltx_api_video_generations: false })).not.toThrow();
  });
  it("pins inputs, uses five seconds and records raw output without accepting quality", async () => {
    vi.stubEnv("LTX_TOKEN", "fixture-secret");
    const f = fixture(), result = await generateA2vSection(f.input, { transport: f.transport, json: f.json });
    const state = JSON.parse(readFileSync(result.attemptPath, "utf8"));
    expect(state.request).toMatchObject({ duration: 5, fps: 24, aspectRatio: "16:9", model: "fast", audio: true, seed: 42 });
    expect(state.status).toBe("downloaded_unreviewed"); expect(state.audioSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(f.input.authorizeSubmission).toHaveBeenCalledTimes(1);
    expect(f.json.mock.calls.filter(c => c[1] === "/api/generate")).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain("fixture-secret");
    expect(f.transport.remote.mock.calls.some(c => c[0].includes("rmdir"))).toBe(true);
    await expect(generateA2vSection(f.input, { transport: f.transport, json: f.json })).rejects.toThrow("reconcile retained attempts");
  });
  it("retains the owned lease and exact attempt after uncertain submission, without retries", async () => {
    vi.stubEnv("LTX_TOKEN", "fixture-secret");
    const f = fixture(), original = f.json.getMockImplementation()!;
    f.json.mockImplementation(async (base, path) => { if (path === "/api/generate") throw new Error("lost fixture-secret response"); return original(base, path); });
    await expect(generateA2vSection(f.input, { transport: f.transport, json: f.json })).rejects.toThrow("[redacted]");
    const state = JSON.parse(readFileSync(join(f.directory, "attempt.json"), "utf8"));
    expect(state.status).toBe("uncertain_reconcile_before_retry");
    expect(f.json.mock.calls.filter(c => c[1] === "/api/generate")).toHaveLength(1);
    expect(f.transport.remote.mock.calls.some(c => c[0].includes("rmdir"))).toBe(false);
  });
  it("submits and records an explicit retake seed without changing the source or local-only request", async () => {
    vi.stubEnv("LTX_TOKEN", "fixture-secret");
    const f = fixture(), result = await generateA2vSection({ ...f.input, seed: 43 }, { transport: f.transport, json: f.json });
    const state = JSON.parse(readFileSync(result.attemptPath, "utf8"));
    expect(f.json).toHaveBeenCalledWith(expect.any(String), "/api/generate", "fixture-secret", 7200000,
      expect.objectContaining({ seed: 43, prompt: f.input.prompt, model: "fast", duration: 5, resolution: "720p", fps: 24, audio: true }));
    expect(state.request.seed).toBe(43);
    expect(state.request.negativePrompt).toBe(buildRequest("performance", state.request.imagePath, state.request.audioPath, { durationSeconds: 5, prompt: f.input.prompt }).negativePrompt);
    expect(state.status).toBe("downloaded_unreviewed");
    expect(f.input.authorizeSubmission).toHaveBeenCalledTimes(1);
    expect(f.json.mock.calls.filter(c => c[1] === "/api/generate")).toHaveLength(1);
  });
  it.each([-1, 0.5, Number.NaN, 2147483648])("rejects invalid seed %s before transport or submission", async seed => {
    vi.stubEnv("LTX_TOKEN", "fixture-secret");
    const f = fixture();
    await expect(generateA2vSection({ ...f.input, seed }, { transport: f.transport, json: f.json })).rejects.toThrow("seed must be an integer");
    expect(f.transport.connect).not.toHaveBeenCalled();
    expect(f.input.authorizeSubmission).not.toHaveBeenCalled();
    expect(f.json).not.toHaveBeenCalled();
  });
  it("keeps the successful standalone speaking negative prompt in the submitted request", async () => {
    vi.stubEnv("LTX_TOKEN", "fixture-secret");
    const f = fixture(), result = await generateA2vSection(f.input, { transport: f.transport, json: f.json });
    const state = JSON.parse(readFileSync(result.attemptPath, "utf8"));
    const baseline = buildRequest("performance", state.request.imagePath, state.request.audioPath,
      { durationSeconds: 5, prompt: f.input.prompt });
    expect(state.request.negativePrompt).toBe(baseline.negativePrompt);
    expect(state.request.negativePrompt).toContain("camera movement");
    expect(state.request.negativePrompt).not.toMatch(/\b(speech|dialogue|narration|talking)\b/i);
    expect(f.json.mock.calls.filter(c => c[1] === "/api/generate")).toHaveLength(1);
  });
  it("does not submit a stale production revision or a missing credential", async () => {
    const f = fixture(); vi.stubEnv("LTX_TOKEN", "");
    await expect(generateA2vSection(f.input, { transport: f.transport, json: f.json })).rejects.toThrow("no speaking generation submitted");
    expect(f.transport.connect).not.toHaveBeenCalled();
    vi.stubEnv("LTX_TOKEN", "fixture-secret"); f.input.authorizeSubmission.mockImplementation(() => { throw new Error("stale source/voice"); });
    await expect(generateA2vSection(f.input, { transport: f.transport, json: f.json })).rejects.toThrow("stale source/voice");
    expect(f.json.mock.calls.some(c => c[1] === "/api/generate")).toBe(false);
  });
});
