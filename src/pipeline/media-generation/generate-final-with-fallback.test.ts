import { describe, expect, it } from "vitest";
import { generateFinalVideoWithFallback, isRaiFilterFailure, MAX_VEO_ATTEMPTS } from "./generate-final-with-fallback.js";
import type { DraftVideoProvider, GenerationResult, ShotRequest, VideoProvider } from "../../providers/types.js";

const request: ShotRequest = { shotId: "shot-1", prompt: "test prompt", characters: [] };

function fakeResult(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    status: "accepted",
    media: { path: "generated/video/shot-1.mp4" },
    cost: { usd: 1 },
    provenance: { provider: "gemini", model: "veo-3.1-lite-generate-preview", prompt: "test prompt" },
    ...overrides
  };
}

function raiFilterError(): Error {
  return new Error(`Veo operation for shot shot-1 finished with no video sample: {"raiMediaFilteredReasons":["..."]}`);
}

function neverCalled(label: string): VideoProvider {
  return {
    async generateFinal() {
      throw new Error(`${label} should not be called`);
    }
  };
}

describe("isRaiFilterFailure", () => {
  it("recognizes the real error message shape", () => {
    expect(isRaiFilterFailure(raiFilterError())).toBe(true);
  });

  it("does not misclassify an unrelated error", () => {
    expect(isRaiFilterFailure(new Error("GEMINI_API_KEY is not set"))).toBe(false);
    expect(isRaiFilterFailure(new Error("network timeout"))).toBe(false);
    expect(isRaiFilterFailure("not even an Error")).toBe(false);
  });
});

describe("generateFinalVideoWithFallback", () => {
  it("returns Veo's result on the first try when it succeeds", async () => {
    let calls = 0;
    const videoProvider: VideoProvider = {
      async generateFinal() {
        calls++;
        return fakeResult();
      }
    };
    const draftProvider: DraftVideoProvider = {
      async generateDraft() {
        throw new Error("should not be called");
      },
      async generateGuided() {
        throw new Error("should not be called");
      }
    };
    const result = await generateFinalVideoWithFallback(videoProvider, neverCalled("kling"), draftProvider, request, {});
    expect(result.tier).toBe("veo");
    expect(result.veoAttempts).toBe(1);
    expect(calls).toBe(1);
  });

  it("retries on a filter failure and succeeds on a later Veo attempt", async () => {
    let calls = 0;
    const videoProvider: VideoProvider = {
      async generateFinal() {
        calls++;
        if (calls < 2) throw raiFilterError();
        return fakeResult();
      }
    };
    const draftProvider: DraftVideoProvider = {
      async generateDraft() {
        throw new Error("should not be called");
      },
      async generateGuided() {
        throw new Error("should not be called");
      }
    };
    const result = await generateFinalVideoWithFallback(videoProvider, neverCalled("kling"), draftProvider, request, {});
    expect(result.tier).toBe("veo");
    expect(result.veoAttempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("falls back to Kling's scene endpoint after exhausting Veo, before ever trying Omni", async () => {
    let veoCalls = 0;
    let klingCalls = 0;
    const videoProvider: VideoProvider = {
      async generateFinal() {
        veoCalls++;
        throw raiFilterError();
      }
    };
    const klingSceneProvider: VideoProvider = {
      async generateFinal() {
        klingCalls++;
        return fakeResult({ provenance: { provider: "kling", model: "kling-v1", prompt: "test prompt" } });
      }
    };
    const draftProvider: DraftVideoProvider = {
      async generateDraft() {
        throw new Error("Omni should not be called when Kling succeeds");
      },
      async generateGuided() {
        throw new Error("should not be called");
      }
    };
    const result = await generateFinalVideoWithFallback(videoProvider, klingSceneProvider, draftProvider, request, {});
    expect(result.tier).toBe("kling_scene");
    expect(veoCalls).toBe(MAX_VEO_ATTEMPTS);
    expect(klingCalls).toBe(1);
    expect(result.provenance.provider).toBe("kling");
  });

  it("falls back to Omni's draft tier only after both Veo and Kling fail", async () => {
    let veoCalls = 0;
    let klingCalls = 0;
    let draftCalls = 0;
    const videoProvider: VideoProvider = {
      async generateFinal() {
        veoCalls++;
        throw raiFilterError();
      }
    };
    const klingSceneProvider: VideoProvider = {
      async generateFinal() {
        klingCalls++;
        throw new Error("Kling image2video task xyz failed: some reason");
      }
    };
    const draftProvider: DraftVideoProvider = {
      async generateDraft() {
        draftCalls++;
        return fakeResult({ provenance: { provider: "gemini", model: "gemini-omni-1.1-flash", prompt: "test prompt" } });
      },
      async generateGuided() {
        throw new Error("should not be called");
      }
    };
    const result = await generateFinalVideoWithFallback(videoProvider, klingSceneProvider, draftProvider, request, {});
    expect(result.tier).toBe("omni_draft");
    expect(veoCalls).toBe(MAX_VEO_ATTEMPTS);
    expect(klingCalls).toBe(1);
    expect(draftCalls).toBe(1);
    expect(result.provenance.model).toBe("gemini-omni-1.1-flash");
  });

  it("propagates a non-filter Veo error immediately without retrying or falling back", async () => {
    let veoCalls = 0;
    let klingCalls = 0;
    let draftCalls = 0;
    const videoProvider: VideoProvider = {
      async generateFinal() {
        veoCalls++;
        throw new Error("GEMINI_API_KEY is not set");
      }
    };
    const klingSceneProvider: VideoProvider = {
      async generateFinal() {
        klingCalls++;
        return fakeResult();
      }
    };
    const draftProvider: DraftVideoProvider = {
      async generateDraft() {
        draftCalls++;
        return fakeResult();
      },
      async generateGuided() {
        throw new Error("should not be called");
      }
    };
    await expect(
      generateFinalVideoWithFallback(videoProvider, klingSceneProvider, draftProvider, request, {})
    ).rejects.toThrow("GEMINI_API_KEY is not set");
    expect(veoCalls).toBe(1);
    expect(klingCalls).toBe(0);
    expect(draftCalls).toBe(0);
  });

  it("passes startFrame through to both the Kling and Omni fallbacks", async () => {
    let klingOpts: unknown;
    let draftOpts: unknown;
    const videoProvider: VideoProvider = {
      async generateFinal() {
        throw raiFilterError();
      }
    };
    const klingSceneProvider: VideoProvider = {
      async generateFinal(_req, opts) {
        klingOpts = opts;
        throw new Error("kling also fails");
      }
    };
    const draftProvider: DraftVideoProvider = {
      async generateDraft(_req, opts) {
        draftOpts = opts;
        return fakeResult();
      },
      async generateGuided() {
        throw new Error("should not be called");
      }
    };
    const startFrame = { path: "generated/keyframes/some-beat.png" };
    await generateFinalVideoWithFallback(videoProvider, klingSceneProvider, draftProvider, request, { startFrame });
    expect((klingOpts as any).startFrame).toEqual(startFrame);
    expect(draftOpts).toEqual({ startFrame });
  });
});
