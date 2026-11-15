/** Single authority for a role's persisted identity, producer-facing name and
 * executable participation. Declared roles are visible contracts, never a
 * dispatcher target. Historical ids resolve without rewriting old events. */
export type RoleAuthority = "production" | "independent_review" | "presentation_only";
export type RoleRuntime = "implemented" | "declared" | "presentation";
export type RolePhase = "planning" | "editing" | "finishing";
export interface ProductionRole { id: string; aliases: readonly string[]; label: string; owner: string; authority: RoleAuthority; runtime: RoleRuntime; phases: readonly RolePhase[]; owns: string; cannot: string; inputs: string; outputs: string; tools: readonly string[]; }
const CONTRACTS: Record<string, Pick<ProductionRole, "owns" | "cannot" | "inputs" | "outputs" | "tools">> = {
  coordinator:{owns:"dependencies, saved progress, budgets, gates and escalation",cannot:"make creative, source, canon, or release decisions",inputs:"durable run state and holds",outputs:"coordination state and escalation",tools:[]},
  creative_director:{owns:"visual intent and bounded creative tradeoffs",cannot:"override fidelity findings, source, canon, cost gates, or producer holds",inputs:"immutable chapter brief",outputs:"creative directions/findings",tools:["structured model review"]},
  source_alignment:{owns:"source completeness, quotations, speakers, audio alignment and uncertainty",cannot:"claim human linguistic approval or alter source performance",inputs:"approved source/audio",outputs:"alignment evidence and holds",tools:[]},
  scripture_cultural_reviewer:{owns:"evidence-backed Scripture and cultural findings",cannot:"claim native-language or field approval",inputs:"immutable chapter brief",outputs:"findings",tools:["structured model review"]},
  casting_canon:{owns:"approved identity/voice references and canon-gap packets",cannot:"invent or approve missing canon",inputs:"approved canon",outputs:"canon-gap evidence",tools:[]},
  storyboard:{owns:"verse- and speech-measured scenes, shots and coverage",cannot:"authorize generation",inputs:"source/alignment",outputs:"shot plan",tools:[]},
  script_supervisor:{owns:"cross-shot character, prop, costume and scene state",cannot:"act as automation QA or waive source findings",inputs:"brief and cut",outputs:"continuity findings",tools:["structured model review"]},
  picture_editor:{owns:"coverage, editorial assembly and milestone film-craft assessment",cannot:"dispatch paid repairs, waive acceptance checks or approve field release",inputs:"treatment, storyboard, bounded selected-media samples and actual cut when attached",outputs:"editorial choices, evidence-linked craft assessment and routed findings",tools:["structured model review"]},
  fidelity_challenger:{owns:"independent source-evidence challenge",cannot:"direct production or release",inputs:"immutable brief",outputs:"independent findings only",tools:["structured model review"]},
  clarity_challenger:{owns:"independent viewer-clarity challenge",cannot:"trade meaning for spectacle or approve release",inputs:"immutable brief",outputs:"independent findings only",tools:["structured model review"]},
  feasibility_challenger:{owns:"independent feasibility/cost/scope challenge",cannot:"schedule, spend, direct production or approve release",inputs:"immutable brief",outputs:"independent findings only",tools:["structured model review"]},
  production_director:{owns:"bounded production decision after specialist evidence",cannot:"waive blocking findings, source, canon, cost or human gates",inputs:"all role contributions",outputs:"approve/revise/hold decision",tools:["structured model review"]}
};
const role = (id: string, owner: string, label: string, phases: readonly RolePhase[], runtime: RoleRuntime = "implemented", aliases: readonly string[] = []): ProductionRole => ({ id, owner, label, phases, runtime, aliases, authority: "production", ...(CONTRACTS[id] ?? { owns:`bounded ${label.toLowerCase()} contribution`, cannot:"override source, approved canon, human review, or release authority", inputs:"immutable chapter brief", outputs:"bounded contribution", tools:runtime === "implemented" ? ["structured model review"] : [] }) });
export const PRODUCTION_ROLE_REGISTRY = [
  role("coordinator", "Mabel", "Production Coordinator", [], "declared"),
  role("creative_director", "Rufus", "Creative Director", ["planning","editing"]),
  role("source_alignment", "June", "Source and Alignment Specialist", [], "declared"),
  role("scripture_cultural_reviewer", "Miriam", "Scripture and Cultural Reviewer", ["planning","editing","finishing"], "implemented", ["scripture_cultural"]),
  role("casting_canon", "Dottie", "Casting and Canon Steward", [], "declared"),
  role("storyboard", "Pippa", "Storyboard Planner", [], "declared"),
  role("cinematographer", "Leon", "Cinematographer", ["planning"], "implemented", ["cinematography"]), role("choreographer", "Tessa", "Choreographer", ["planning"], "implemented", ["choreography"]),
  role("staging_designer", "Arlo", "Production and Staging Designer", ["planning"], "implemented", ["staging", "production_designer"]),
  role("costume_designer", "Costume specialist", "Costume Designer", ["planning"], "implemented", ["costume"]), role("lighting_designer", "Lighting specialist", "Lighting Designer", ["planning"], "implemented", ["lighting"]),
  role("script_supervisor", "Orion", "Continuity Reviewer", ["planning","editing","finishing"], "implemented", ["continuity"]),
  role("generation", "Gus", "Generation Specialist", [], "declared"), role("media_quality", "Vera", "Independent Media Quality Reviewer", [], "declared"), role("dialogue_lipsync", "Kit", "Dialogue / Lip-Sync Specialist", [], "declared"),
  role("sound_designer", "Sam", "Sound Designer / Mixer", ["planning","finishing"], "implemented", ["sound"]), role("composer", "Composer specialist", "Composer", ["planning","finishing"]), role("colorist", "Colorist specialist", "Colorist", ["finishing"], "implemented", ["color"]),
  // Nell assesses the available specialist proposals before the independent
  // challengers and Director; no additional call or reviewer is introduced.
  role("picture_editor", "Nell", "Picture Editor", ["planning","editing","finishing"], "implemented", ["picture_editing"]),
  { ...role("fidelity_challenger", "Ada", "Fidelity Challenger", ["planning","editing","finishing"]), authority: "independent_review" }, { ...role("clarity_challenger", "Theo", "Audience Clarity Challenger", ["planning","editing","finishing"]), authority: "independent_review" }, { ...role("feasibility_challenger", "Cora", "Feasibility Challenger", ["planning","editing","finishing"]), authority: "independent_review" },
  role("production_director", "Production Director", "Production Director", ["planning","editing","finishing"]),
  { ...role("critics", "Presentation critics", "Optional presentation critics", [], "presentation"), authority: "presentation_only" }
] as const satisfies readonly ProductionRole[];
export type ExecutableRole = Extract<typeof PRODUCTION_ROLE_REGISTRY[number], { runtime: "implemented" }> ["id"] | "production_director";
export function resolveRoleId(id: string): string | undefined { return PRODUCTION_ROLE_REGISTRY.find(r => r.id === id || r.aliases.includes(id))?.id; }
export function executableRolesFor(phase: RolePhase): string[] { return PRODUCTION_ROLE_REGISTRY.filter(r => r.runtime === "implemented" && r.phases.includes(phase)).map(r => r.id); }
/** Independent reviewers are dispatched explicitly after the production pass;
 * they must not be mistaken for production-direction authority. */
export function executableProductionRolesFor(phase: RolePhase): string[] { return PRODUCTION_ROLE_REGISTRY.filter(r => r.runtime === "implemented" && r.authority === "production" && r.phases.includes(phase)).map(r => r.id); }
