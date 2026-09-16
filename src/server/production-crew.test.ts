import { describe, expect, it } from "vitest";
import { buildProductionCrewView } from "./production-crew.js";
describe("buildProductionCrewView", () => {
  it("maps the active pipeline stage without fabricating an interaction log", () => {
    const view = buildProductionCrewView({ id: "mark-2", stage: "media_generation", status: "running" }, []);
    expect(view.project.activeDepartment).toBe("production"); expect(view.interactionLog).toEqual([]); expect(view.interactionLogState).toContain("No persisted");
  });
  it("preserves persisted director negotiations for producer inspection", () => {
    const log = { id: "log-1", narration_span_verse_ref: "Mark 2:8-9", idea_id: "idea-1", round: 1, role: "production_director" as const, verdict: "request_changes" as const, content: "Keep the cost bounded.", created_at: 1 };
    const view = buildProductionCrewView({ id: "mark-2", stage: "casting", status: "ready" }, [log]);
    expect(view.project.activeDepartment).toBe("planning"); expect(view.interactionLogState).toBe("persisted"); expect(view.interactionLog).toEqual([log]);
  });
});
