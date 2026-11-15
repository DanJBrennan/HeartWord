import { expect, it } from "vitest";
import { assertPerformancePlanReady } from "./performance-plan-guards.js";

const pauses = [{ startMs: 1_000, endMs: 1_300 }, { startMs: 5_200, endMs: 5_500 }];
const ready = { sceneId: "scene-4", setReferenceAttemptId: "set-accepted", expectedSetReferenceAttemptId: "set-accepted", sourceStartMs: 1_300, sourceEndMs: 5_200 };

it("allows only a set-locked performance bounded by real source pauses", () => {
  expect(() => assertPerformancePlanReady(ready, pauses)).not.toThrow();
});

it("holds a performance that invents a scene or cuts through source speech", () => {
  expect(() => assertPerformancePlanReady({ ...ready, setReferenceAttemptId: "other-set" }, pauses)).toThrow(/set reference/);
  expect(() => assertPerformancePlanReady({ ...ready, sourceStartMs: 1_350 }, pauses)).toThrow(/attested/);
});
