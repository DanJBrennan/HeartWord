import { describe, expect, it } from "vitest";
import { PRODUCTION_ROLE_REGISTRY, executableRolesFor, resolveRoleId } from "../../src/pipeline/creative-direction/role-registry.js";

describe("authoritative production role registry", () => {
  it("keeps 19 producer roles, three independent reviewers, and presentation outside execution", () => {
    expect(PRODUCTION_ROLE_REGISTRY.filter(r => r.authority === "production" && r.id !== "production_director")).toHaveLength(19);
    expect(PRODUCTION_ROLE_REGISTRY.filter(r => r.authority === "independent_review")).toHaveLength(3);
    expect(PRODUCTION_ROLE_REGISTRY.find(r => r.id === "critics")?.runtime).toBe("presentation");
  });
  it("resolves historical public and crew ids without rewriting events", () => {
    for (const [oldId, canonical] of Object.entries({ scripture_cultural:"scripture_cultural_reviewer", staging:"staging_designer", production_designer:"staging_designer", cinematography:"cinematographer", choreography:"choreographer", continuity:"script_supervisor", picture_editing:"picture_editor", sound:"sound_designer", color:"colorist" })) expect(resolveRoleId(oldId)).toBe(canonical);
  });
  it("fails closed for declared and presentation roles, while phase dispatch includes executable reviewers", () => {
    for (const role of PRODUCTION_ROLE_REGISTRY.filter(r => r.runtime !== "implemented")) expect(executableRolesFor("planning")).not.toContain(role.id);
    for (const phase of ["planning", "editing", "finishing"] as const) for (const role of executableRolesFor(phase)) expect(PRODUCTION_ROLE_REGISTRY.find(r => r.id === role)?.phases).toContain(phase);
  });
  it("retains explicit boundaries and contracts for every producer-facing role", () => {
    for (const role of PRODUCTION_ROLE_REGISTRY.filter(r => r.authority !== "presentation_only")) {
      expect(role.owns, role.id).not.toBe(role.label); expect(role.cannot, role.id).not.toBe(""); expect(role.inputs, role.id).not.toBe(""); expect(role.outputs, role.id).not.toBe("");
    }
    expect(PRODUCTION_ROLE_REGISTRY.find(r => r.id === "fidelity_challenger")?.cannot).toContain("direct production");
  });
});
