import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiMusicProvider, ElevenLabsEffectsProvider } from "../../src/providers/soundtrack.js";

afterEach(() => vi.unstubAllEnvs());
describe("soundtrack provider contracts", () => {
  it("sends the Composer's structure to Gemini's documented music endpoint and reads model_output audio", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const request = vi.fn(async () => new Response(JSON.stringify({ id: "interaction", steps: [
      { type: "model_output", content: [{ type: "text", text: "Instrumental structure" }, { type: "audio", data: Buffer.from("audio").toString("base64"), mime_type: "audio/mpeg" }] }
    ] }), { status: 200 }));
    const result = await new GeminiMusicProvider(request).generate({ kind: "music", durationMs: 45000, loop: false, prompt: "Hand drums, restrained opening; build at 25 seconds, resolve gently." });
    expect(result.bytes.toString()).toBe("audio"); expect(result.provider).toBe("gemini");
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse(String(init.body)); expect(body.model).toBe("lyria-3.5");
    expect(body.input).toContain("build at 25 seconds"); expect(body.input).toContain("no vocals");
  });
  it("does not treat a text-only music response as generated audio", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const request = vi.fn(async () => new Response(JSON.stringify({ steps: [] })));
    await expect(new GeminiMusicProvider(request).generate({ kind: "music", durationMs: 30000, loop: false, prompt: "Quiet" })).rejects.toThrow("complete audio");
  });
  it("sends a separately timed, loopable effects request without using voice synthesis", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const request = vi.fn(async () => new Response("effect", { headers: { "character-cost": "25" } }));
    const result = await new ElevenLabsEffectsProvider(request).generate({ kind: "sfx", durationMs: 8000, loop: true, prompt: "Chickens clucking at a distance in a quiet street" });
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/sound-generation");
    expect(JSON.parse(String(init.body))).toMatchObject({ model_id: "eleven_text_to_sound_v2", duration_seconds: 8, loop: true });
    expect(result.usage).toEqual({ characterCost: "25" });
  });
  it("rejects unsupported effect durations before making a paid call", async () => {
    const request = vi.fn();
    await expect(new ElevenLabsEffectsProvider(request).generate({ kind: "sfx", durationMs: 31000, loop: false, prompt: "Wind" })).rejects.toThrow("0.5–30");
    expect(request).not.toHaveBeenCalled();
  });
});
