/** Single authority for a role's persisted identity, producer-facing name and
 * executable participation. Declared roles are visible contracts, never a
 * dispatcher target. Historical ids resolve without rewriting old events. */
export type RoleAuthority = "production" | "independent_review" | "presentation_only";
export type RoleRuntime = "implemented" | "declared" | "presentation";
export type RolePhase = "planning" | "editing" | "finishing";
export interface ProductionRole { id: string; aliases: readonly string[]; label: string; owner: string; authority: RoleAuthority; runtime: RoleRuntime; phases: readonly RolePhase[]; owns: string; cannot: string; }
const role = (id: string, owner: string, label: string, phases: readonly RolePhase[], runtime: RoleRuntime = "implemented", aliases: readonly string[] = []): ProductionRole => ({ id, owner, label, phases, runtime, aliases, authority: "production", owns: label, cannot: "override source, approved canon, human review, or release authority" });
export const PRODUCTION_ROLE_REGISTRY = [
  role("coordinator", "Mabel", "Production Coordinator", [], "declared"),
  role("creative_director", "Rufus", "Creative Director", ["planning","editing"]),
  role("source_alignment", "June", "Source and Alignment Specialist", [], "declared"),
  role("scripture_cultural_reviewer", "Miriam", "Scripture and Cultural Reviewer", ["planning","editing","finishing"], "implemented", ["scripture_cultural"]),
  role("casting_canon", "Dottie", "Casting and Canon Steward", [], "declared"),
  role("storyboard", "Pippa", "Storyboard Planner", [], "declared"),
  role("cinematographer", "Leon", "Cinematographer", ["planning"]), role("choreographer", "Tessa", "Choreographer", ["planning"]),
  role("staging_designer", "Arlo", "Production and Staging Designer", ["planning"], "implemented", ["staging", "production_designer"]),
  role("costume_designer", "Costume specialist", "Costume Designer", ["planning"], "implemented", ["costume"]), role("lighting_designer", "Lighting specialist", "Lighting Designer", ["planning"], "implemented", ["lighting"]),
  role("script_supervisor", "Orion", "Continuity Reviewer", ["planning","editing","finishing"], "implemented", ["continuity"]),
  role("generation", "Gus", "Generation Specialist", [], "declared"), role("media_quality", "Vera", "Independent Media Quality Reviewer", [], "declared"), role("dialogue_lipsync", "Kit", "Dialogue / Lip-Sync Specialist", [], "declared"),
  role("picture_editor", "Nell", "Picture Editor", ["planning","editing","finishing"]), role("sound_designer", "Sam", "Sound Designer / Mixer", ["finishing"], "implemented", ["sound"]), role("composer", "Composer specialist", "Composer", ["finishing"]), role("colorist", "Colorist specialist", "Colorist", ["finishing"]),
  { ...role("fidelity_challenger", "Ada", "Fidelity Challenger", [], "declared"), authority: "independent_review" }, { ...role("clarity_challenger", "Theo", "Audience Clarity Challenger", [], "declared"), authority: "independent_review" }, { ...role("feasibility_challenger", "Cora", "Feasibility Challenger", [], "declared"), authority: "independent_review" },
  { ...role("critics", "Presentation critics", "Optional presentation critics", [], "presentation"), authority: "presentation_only" }
] as const satisfies readonly ProductionRole[];
export type ExecutableRole = Extract<typeof PRODUCTION_ROLE_REGISTRY[number], { runtime: "implemented" }> ["id"] | "production_director";
export function resolveRoleId(id: string): string | undefined { return PRODUCTION_ROLE_REGISTRY.find(r => r.id === id || r.aliases.includes(id))?.id ?? (id === "production_director" ? id : undefined); }
export function executableRolesFor(phase: RolePhase): string[] { return PRODUCTION_ROLE_REGISTRY.filter(r => r.runtime === "implemented" && r.phases.includes(phase)).map(r => r.id); }
