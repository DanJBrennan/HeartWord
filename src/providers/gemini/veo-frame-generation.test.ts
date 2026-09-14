import { describe, expect, it } from "vitest";
import { buildVeoFrameRequestBody } from "./index.js";

describe("buildVeoFrameRequestBody", () => {
  it("sends the optional first/last-frame closure constraint to Veo", () => {
    const body = buildVeoFrameRequestBody("steady portrait", "first-frame", "closing-frame", "720p", 8);

    expect(body.instances).toEqual([
      {
        prompt: "steady portrait",
        image: { bytesBase64Encoded: "first-frame", mimeType: "image/png" },
        lastFrame: { bytesBase64Encoded: "closing-frame", mimeType: "image/png" }
      }
    ]);
    expect(body.parameters).toEqual({ aspectRatio: "16:9", durationSeconds: 8, resolution: "720p" });
  });

  it("keeps ordinary start-frame-only generations unchanged", () => {
    const body = buildVeoFrameRequestBody("steady portrait", "first-frame", undefined, "1080p", 4);

    expect(body.instances[0]).not.toHaveProperty("lastFrame");
    expect(body.parameters).toEqual({ aspectRatio: "16:9", durationSeconds: 4, resolution: "1080p" });
  });
});
