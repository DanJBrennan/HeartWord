export interface CrewProjectState { id: string; stage: string; status: string; }
export interface NegotiationLogEntry { id: string; narration_span_verse_ref: string; idea_id: string; round: number; role: "creative_director" | "production_director"; verdict: "approve" | "request_changes" | "reject" | "forced_final" | null; content: string; created_at: number; }
export const STAGE_DEPARTMENTS: Record<string, string> = { ingestion: "continuity", scene_breakdown: "planning", casting: "planning", media_generation: "production", voice_lipsync: "production", assembly: "production", qc: "quality" };
export function buildProductionCrewView(project: CrewProjectState, interactionLog: NegotiationLogEntry[]) {
  return { project: { id: project.id, stage: project.stage, status: project.status, activeDepartment: STAGE_DEPARTMENTS[project.stage] ?? null }, interactionLog, interactionLogState: interactionLog.length > 0 ? "persisted" : "No persisted Creative Director / Production Director interaction for this chapter yet. The map shows declared and planned paths, not a live conversation." };
}
