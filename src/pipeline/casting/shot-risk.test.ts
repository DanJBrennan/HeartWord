import { expect, it } from "vitest";
import { assessShotRisk, escalateToCritical, type ShotRiskFacts } from "./shot-risk.js";

const plain: ShotRiskFacts = {
  framing: "medium_close", cameraMovement: "static", crowdDensity: "empty", characterCount: 1
};

it("leaves a simple small-cast shot on the cheapest tier", () => {
  const risk = assessShotRisk(plain);
  expect(risk).toMatchObject({ tier: "routine", draftFirst: false });
  expect(risk.reasons).toEqual(["no elevated risk factors"]);
});

it("treats a frame full of named likenesses as critical however it is staged", () => {
  // Mark 3's "remaining nine apostles gathered together" shot -- sparse
  // crowd, but nine canon faces to hold at once.
  const risk = assessShotRisk({ ...plain, characterCount: 9, crowdDensity: "sparse" });
  expect(risk).toMatchObject({ tier: "critical", draftFirst: true });
  expect(risk.reasons).toContain("9 named characters in frame");
});

it("compounds a busy cast with a packed crowd into critical", () => {
  const risk = assessShotRisk({ ...plain, characterCount: 5, crowdDensity: "packed" });
  expect(risk.tier).toBe("critical");
  expect(risk.reasons).toContain("5 named characters in a packed crowd");
  // The same cast without the crowd is a tier lower.
  expect(assessShotRisk({ ...plain, characterCount: 5, crowdDensity: "sparse" }).tier).toBe("elevated");
});

it("raises a moderate cast to elevated", () => {
  expect(assessShotRisk({ ...plain, characterCount: 4 })).toMatchObject({ tier: "elevated", draftFirst: true });
});

it("counts a packed crowd only when the shot actually shows it", () => {
  // A packed room behind a two-hander close-up is not the render problem a
  // packed room in a wide tracking shot is.
  expect(assessShotRisk({ ...plain, crowdDensity: "packed" }).tier).toBe("routine");
  expect(assessShotRisk({ ...plain, crowdDensity: "packed", framing: "wide" }).tier).toBe("elevated");
  expect(assessShotRisk({ ...plain, crowdDensity: "packed", cameraMovement: "tracking" }).tier).toBe("elevated");
});

it("ignores camera and framing without a crowd, so a quiet wide shot stays cheap", () => {
  expect(assessShotRisk({ ...plain, framing: "wide", cameraMovement: "tracking" }).tier).toBe("routine");
});

it("always states why, so a tier is reviewable rather than asserted", () => {
  for (const facts of [plain, { ...plain, characterCount: 9 }, { ...plain, crowdDensity: "packed" as const, framing: "wide" as const }]) {
    expect(assessShotRisk(facts).reasons.length).toBeGreaterThan(0);
  }
});

it("escalates on a producer's stated reason without inventing emotional weight itself", () => {
  // Mark 3:5's healing insert is structurally trivial -- two characters,
  // locked off -- but it is the emotional turn of the scene. Nothing in
  // the shot row carries that, so it is supplied explicitly.
  const routine = assessShotRisk(plain);
  expect(routine.tier).toBe("routine");
  const escalated = escalateToCritical(routine, "the healing is this scene's emotional turn");
  expect(escalated).toMatchObject({ tier: "critical", draftFirst: true });
  expect(escalated.reasons).toEqual(["the healing is this scene's emotional turn"]);
});

it("refuses to escalate without a reason, and never lowers an existing tier", () => {
  expect(() => escalateToCritical(assessShotRisk(plain), "  ")).toThrow("requires a stated reason");
  const critical = assessShotRisk({ ...plain, characterCount: 9 });
  const escalated = escalateToCritical(critical, "canon-critical likeness");
  expect(escalated.tier).toBe("critical");
  expect(escalated.reasons).toEqual(expect.arrayContaining(["9 named characters in frame", "canon-critical likeness"]));
});
