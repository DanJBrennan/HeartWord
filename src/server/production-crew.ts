/** Canonical roster metadata shared by the control room and producer-facing views.
 * It describes declared ownership; it does not dispatch a model or provider. */
export type CrewAuthority = "production" | "independent_review" | "presentation_only";
export interface CrewRole { id: string; label: string; owner: string; authority: CrewAuthority; runtime: "implemented" | "declared" | "presentation"; owns: string; cannot: string; }
export const PRODUCTION_CREW: readonly CrewRole[] = [
  { id:"coordinator", label:"Production Coordinator", owner:"Mabel", authority:"production", runtime:"declared", owns:"dependencies, saved progress, budgets, gates and escalation", cannot:"make creative, source, canon, or release decisions" },
  { id:"creative_director", label:"Creative Director", owner:"Rufus", authority:"production", runtime:"implemented", owns:"visual intent and bounded creative tradeoffs", cannot:"override fidelity findings, source, canon, cost gates, or producer holds" },
  { id:"source_alignment", label:"Source and Alignment Specialist", owner:"June", authority:"production", runtime:"declared", owns:"source completeness, quotations, speakers, audio alignment and uncertainty", cannot:"claim human linguistic approval or alter source performance" },
  { id:"scripture_cultural", label:"Scripture and Cultural Reviewer", owner:"Miriam", authority:"production", runtime:"implemented", owns:"evidence-backed Scripture and cultural findings", cannot:"claim native-language or field approval" },
  { id:"casting_canon", label:"Casting and Canon Steward", owner:"Dottie", authority:"production", runtime:"declared", owns:"approved identity/voice references and canon-gap packets", cannot:"invent or approve missing canon" },
  { id:"storyboard", label:"Storyboard Planner", owner:"Pippa", authority:"production", runtime:"implemented", owns:"verse- and speech-measured scenes, shots and coverage", cannot:"authorize generation" },
  { id:"cinematography", label:"Cinematographer", owner:"Leon", authority:"production", runtime:"implemented", owns:"framing, camera and coverage", cannot:"change action, cast or source" },
  { id:"choreography", label:"Choreographer", owner:"Tessa", authority:"production", runtime:"implemented", owns:"blocking and movement", cannot:"add source-unsupported events" },
  { id:"staging", label:"Production and Staging Designer", owner:"Arlo", authority:"production", runtime:"implemented", owns:"locations, sets, props and spatial geography", cannot:"change story beats or canon" },
  { id:"costume", label:"Costume Designer", owner:"Role specialist", authority:"production", runtime:"implemented", owns:"approved costume continuity", cannot:"redesign canon" },
  { id:"lighting", label:"Lighting Designer", owner:"Role specialist", authority:"production", runtime:"implemented", owns:"motivated lighting continuity", cannot:"override shot state" },
  { id:"continuity", label:"Script Supervisor / Continuity Reviewer", owner:"Orion", authority:"production", runtime:"implemented", owns:"cross-shot character, prop, costume and scene state", cannot:"act as automation QA or waive source findings" },
  { id:"generation", label:"Generation Specialist", owner:"Gus", authority:"production", runtime:"declared", owns:"provider-ready briefs and targeted repair proposals", cannot:"make provider calls or silently spend" },
  { id:"media_quality", label:"Media Quality Reviewer", owner:"Vera", authority:"production", runtime:"declared", owns:"independent candidate-media evidence and repair recommendations", cannot:"generate or approve a failed asset" },
  { id:"dialogue_lipsync", label:"Dialogue / Lip-Sync Specialist", owner:"Kit", authority:"production", runtime:"declared", owns:"approved speech treatment and sync evidence", cannot:"own source alignment or rewrite speech" },
  { id:"picture_editing", label:"Picture Editor", owner:"Nell", authority:"production", runtime:"implemented", owns:"cut, coverage, pacing, pauses, transitions and opening/closing treatment", cannot:"replace source performance or publish" },
  { id:"sound", label:"Sound Designer / Mixer", owner:"Sam", authority:"production", runtime:"implemented", owns:"ambience, effects and speech-priority mix", cannot:"replace approved source audio" },
  { id:"composer", label:"Composer", owner:"Role specialist", authority:"production", runtime:"implemented", owns:"instrumental score proposals", cannot:"create speech or bypass cue review" },
  { id:"color", label:"Colorist", owner:"Role specialist", authority:"production", runtime:"implemented", owns:"restrained color continuity", cannot:"change canon identity" },
  { id:"fidelity_challenger", label:"Fidelity Challenger", owner:"Ada", authority:"independent_review", runtime:"declared", owns:"independent source-evidence challenge", cannot:"direct production or release" },
  { id:"clarity_challenger", label:"Audience Clarity / Dramatic Impact Challenger", owner:"Theo", authority:"independent_review", runtime:"declared", owns:"independent viewer-clarity challenge", cannot:"trade meaning for spectacle" },
  { id:"feasibility_challenger", label:"Feasibility / Cost / Scope Challenger", owner:"Cora", authority:"independent_review", runtime:"declared", owns:"independent feasibility challenge", cannot:"schedule or spend" },
  { id:"critics", label:"Optional presentation critics", owner:"Gene Siskel and Roger Ebert", authority:"presentation_only", runtime:"presentation", owns:"staged, non-authoritative commentary", cannot:"influence production" }
];
export const STAGE_DEPARTMENTS: Record<string, string> = { ingestion:"source alignment", scene_breakdown:"planning", casting:"planning", media_generation:"generation", voice_lipsync:"dialogue and lip-sync", assembly:"picture and sound", qc:"quality" };
export interface NegotiationLogEntry { id: string; narration_span_verse_ref: string; idea_id: string; round: number; role: "creative_director" | "production_director"; verdict: "approve" | "request_changes" | "reject" | "forced_final" | null; content: string; created_at: number; }
export interface ProductionMonitorEvent { id: string; kind: "crew_event" | "negotiation"; sender: string; round: number; status: "active" | "completed" | "held" | "error"; context: string; summary: string; createdAt: number; }
export function buildProductionCrewView(project: { id: string; stage: string; status: string }, interactionLog: NegotiationLogEntry[] = []) {
  return { project: { ...project, activeDepartment: STAGE_DEPARTMENTS[project.stage] ?? null }, roster: PRODUCTION_CREW, interactionLog, interactionLogState: interactionLog.length ? "persisted" : "No persisted production negotiation for this chapter yet.", note: "Runtime labels identify implemented calls only; declared roles describe the approved operating contract, not live autonomous agents." };
}
export function buildProductionMonitor(events: ProductionMonitorEvent[]) {
  const outstanding = events.filter(event => event.status === "held" || event.status === "error");
  return { events, outstanding, state: events.some(event => event.status === "active") ? "active" : outstanding.length ? "needs_producer_input" : "idle", note: "Recorded workflow events only. This monitor never displays presentation dialogue or hidden model reasoning." };
}
