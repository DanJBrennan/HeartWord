import { describe, expect, it } from "vitest";
import { PRODUCTION_CREW, buildProductionCrewView } from "./production-crew.js";
describe("production crew roster", () => {
  it("keeps the approved production, independent-review, and presentation boundaries distinct", () => {
    expect(PRODUCTION_CREW.filter(r => r.authority === "production")).toHaveLength(19);
    expect(PRODUCTION_CREW.filter(r => r.authority === "independent_review").map(r => r.owner)).toEqual(["Ada", "Theo", "Cora"]);
    expect(PRODUCTION_CREW.find(r => r.owner === "Orion")?.label).toContain("Continuity");
    expect(PRODUCTION_CREW.find(r => r.owner === "June")?.label).toContain("Alignment");
  });
  it("labels stage placement without fabricating agent activity", () => expect(buildProductionCrewView({ id:"mark-2", stage:"assembly", status:"running" }).note).toContain("not live"));
});
