import { describe, expect, it } from "vitest";
import { buildChapterEndingPlan, type ChapterEndingProposal } from "../../src/pipeline/casting/chapter-ending.js";

const current = "And looking about at those who sat around him, he said, Here are my mother and my brothers! For whoever does the will of God, he is my brother and sister and mother.";
const next = "Again he began to teach beside the sea. And a very large crowd gathered about him, so that he got into a boat and sat in it on the sea.";
const proposal: ChapterEndingProposal = { reasoning: "After the complete Mark 3 speech, bridge wordlessly toward the next verified setting; the walking route is inferred staging.", shots: [
  { role: "departure", description: "He rises after speaking and leaves the house.", reason: "Let the completed speech settle.", currentEvidence: "those who sat around him", nextEvidence: "beside the sea", durationSec: 5 },
  { role: "journey", description: "Follow him along a plausible village path.", reason: "Connect the locations without narration.", currentEvidence: "Here are my mother and my brothers", nextEvidence: "beside the sea", durationSec: 5 },
  { role: "destination_hint", description: "Pull back toward the sea as individual people gather.", reason: "Prepare the next opening without depicting teaching or the boat.", currentEvidence: "those who sat around him", nextEvidence: "a very large crowd gathered", durationSec: 5 }
] };

describe("post-source chapter handoff", () => {
  const input = { currentFinalText: current, nextChapterRef: "Mark 4:1", nextChapterFirstVerse: next, sourceClockEndMs: 429852 };
  it("keeps a grounded transition after the complete source performance", () => {
    const plan = buildChapterEndingPlan({ ...input, proposal });
    expect(plan).toMatchObject({ status: "proposed", sourceClockEndMs: 429852, postSourceDurationMs: 15000,
      boundary: "after_complete_source_performance", reusePolicy: "candidate_only_target_review_required" });
    expect(plan.shots.map(shot => shot.role)).toEqual(["departure", "journey", "destination_hint"]);
    expect(plan.shots.every(shot => shot.audio === "ambience_with_optional_score" && shot.mediaStatus === "unassigned")).toBe(true);
  });
  it("does not invent a handoff when the next verified verse is absent", () => {
    const plan = buildChapterEndingPlan({ ...input, nextChapterFirstVerse: null, proposal });
    expect(plan.status).toBe("needs_review");
    expect(plan.shots).toEqual([]);
  });
  it("holds unsupported evidence, oversize footage, and an ending that never reaches the next location", () => {
    const unsupported = buildChapterEndingPlan({ ...input, proposal: { ...proposal, shots: [{ ...proposal.shots[0]!, nextEvidence: "Jerusalem fortress" }] } });
    expect(unsupported).toMatchObject({ status: "needs_review", shots: [] });
    const oversize = buildChapterEndingPlan({ ...input, proposal: { ...proposal, shots: [{ ...proposal.shots[0]!, durationSec: 12 }] } });
    expect(oversize.status).toBe("needs_review");
    const noHint = buildChapterEndingPlan({ ...input, proposal: { ...proposal, shots: proposal.shots.slice(0, 2) } });
    expect(noHint.status).toBe("needs_review");
  });
  it("allows an intentional direct handoff with no added footage", () => {
    const plan = buildChapterEndingPlan({ ...input, proposal: { reasoning: "The next chapter can open directly; no inferred journey is needed.", shots: [] } });
    expect(plan).toMatchObject({ status: "proposed", shots: [], postSourceDurationMs: 0 });
  });
});
