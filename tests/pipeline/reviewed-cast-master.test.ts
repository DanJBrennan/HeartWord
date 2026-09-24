import { describe, expect, it } from "vitest";
import { reviewedCastMasterIsReusable } from "../../src/pipeline/voicing/index.js";

const corrected = {
  force: false, originalDurationMs: 13420, castStartMs: 0,
  castEndMs: 13420, measuredCastDurationMs: 13420,
  mappedSourceHash: "source-hash", currentSourceHash: "source-hash",
  mappedVoiceVersionId: "approved-voice", currentVoiceVersionId: "approved-voice"
};

describe("producer-reviewed cast-master boundary", () => {
  it("reuses the corrected asset instead of resurrecting the old full-length file", () => {
    expect(reviewedCastMasterIsReusable(corrected)).toBe(true);
  });

  it("holds stale duration, changed source, or recast voice", () => {
    expect(reviewedCastMasterIsReusable({ ...corrected, castEndMs: 13978, measuredCastDurationMs: 13978 })).toBe(false);
    expect(reviewedCastMasterIsReusable({ ...corrected, currentSourceHash: "changed" })).toBe(false);
    expect(reviewedCastMasterIsReusable({ ...corrected, currentVoiceVersionId: "other-voice" })).toBe(false);
  });

  it("requires an explicit reconciliation for a forced regeneration", () => {
    expect(reviewedCastMasterIsReusable({ ...corrected, force: true })).toBe(false);
  });
});
