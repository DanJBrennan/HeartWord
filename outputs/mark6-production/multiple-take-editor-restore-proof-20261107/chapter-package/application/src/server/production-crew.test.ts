import { describe, expect, it } from "vitest";
import { PRODUCTION_CREW, buildProductionCrewView, buildProductionMonitor } from "./production-crew.js";
describe("production crew roster", () => {
  it("keeps the approved production, independent-review, and presentation boundaries distinct", () => {
    expect(PRODUCTION_CREW.filter(r => r.authority === "production")).toHaveLength(19);
    expect(PRODUCTION_CREW.filter(r => r.authority === "independent_review").map(r => r.owner)).toEqual(["Ada", "Theo", "Cora"]);
    expect(PRODUCTION_CREW.find(r => r.owner === "Orion")?.label).toContain("Continuity");
    expect(PRODUCTION_CREW.find(r => r.owner === "June")?.label).toContain("Alignment");
  });
  it("labels stage placement without fabricating agent activity", () => expect(buildProductionCrewView({ id:"mark-2", stage:"assembly", status:"running" }).note).toContain("not live"));
  it("surfaces recorded holds without inventing a conversation", () => {
    const monitor = buildProductionMonitor([{ id:"e1", kind:"crew_event", sender:"picture_editor", round:1, status:"held", context:"Mark 2:8-9", summary:"Coverage required", createdAt:1 }]);
    expect(monitor.state).toBe("needs_producer_input"); expect(monitor.outstanding[0]?.summary).toBe("Coverage required");
  });
  it("keeps superseded recorded holds visible as history without demanding producer input", () => {
    const monitor = buildProductionMonitor([{ id:"old", kind:"crew_event", sender:"picture_editor", round:1, status:"held", current:false, context:"Mark 2:8-9", summary:"Resolved in a later run", createdAt:1 }]);
    expect(monitor.state).toBe("idle"); expect(monitor.outstanding).toEqual([]);
  });
});
