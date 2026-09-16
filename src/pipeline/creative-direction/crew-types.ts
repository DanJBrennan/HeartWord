import type { SavedCutTimingAudit } from "../assembly/cut-timing-audit.js";

export const PLANNING_ROLES = [
  "creative_director", "cinematographer", "choreographer", "staging_designer",
  "production_designer", "costume_designer", "lighting_designer",
  "script_supervisor", "picture_editor", "scripture_cultural_reviewer"
] as const;
export const FINISHING_ROLES = ["picture_editor", "script_supervisor", "colorist", "sound_designer", "composer",
  "scripture_cultural_reviewer"] as const;
export const EDITING_ROLES = ["creative_director", "picture_editor", "script_supervisor", "scripture_cultural_reviewer"] as const;
export type CrewRole = typeof PLANNING_ROLES[number] | typeof FINISHING_ROLES[number] | "production_director";
export type CrewPhase = "planning" | "editing" | "finishing";
export interface AudioPlacement { segmentId: string; sourceStartMs: number; sourceEndMs: number; startMs: number; endMs: number }
export interface CrewShot {
  id: string; sceneId: string; sceneSequence: number; sequence: number;
  verseRef: string; action: string; framing: string | null; cameraMovement: string | null;
  continuity: string | null; lighting: string | null; needsLipSync: boolean;
  characterIds: string[]; dialogueCharacterId: string | null;
  beats: Array<{ id: string; sequence: number; notes: string | null; characterId: string | null;
    startMs: number; endMs: number }>;
  clip: { id: string; path: string; durationMs: number } | null;
}
export interface CrewBrief {
  project: { id: string; language: string; book: string; chapter: number };
  source: { text: Array<{ verse: number; text: string }>; reference: Array<{ verse: number; text: string }>;
    hashes: string[] };
  audio: Array<{ id: string; startMs: number; endMs: number; verseRef: string | null;
    speakerId: string | null; path: string; confidence: number | null; provenance?: "unassigned_source_interval"; sourceSpeakerId?: string }>;
  canon: Array<{ id: string; name: string; region: string; versionId: string; notes: string | null; joinedAt: string | null }>;
  shots: CrewShot[];
  producerNotes: Array<{ id: string; subjectId: string; note: string }>;
  appliedLessons?: Array<{ id: string; scopeKind: string; requestedChange: string; rationale: string | null }>;
  spentUsd: number;
  audioAssets: Array<{ id: string; kind: "music" | "sfx"; description: string; path: string;
    sha256: string; durationMs: number }>;
  render: { id: string; path: string; durationMs: number; sha256: string;
    timeline: Array<{ shotId: string; startMs: number; endMs: number }>; audioMap?: AudioPlacement[];
    timingAudit?: SavedCutTimingAudit;
    finishing?: { baseRenderId: string; basePath: string; baseSha256: string; previousDecisions: CrewResult["contributions"] } } | null;
}
export interface CrewFinding {
  shotId: string | null; severity: "blocking" | "advisory";
  evidence: string; requestedChange: string;
}
export interface CrewContribution {
  summary: string;
  directions: Array<{ shotId: string; instruction: string; scriptureBasis: string }>;
  findings: CrewFinding[];
  coverageRequests?: Array<{ shotId: string; additionalMs: number; description: string; reason: string }>;
  edits?: Array<{ shotId: string; sourceStartMs: number; durationMs: number }>;
  pauses?: Array<{ afterSegmentId: string | null; durationMs: number; reason: string }>;
  colorAdjustments?: Array<{ shotId: string; brightness: number; contrast: number; saturation: number; reason: string }>;
  audioCues?: Array<{ assetId: string; startMs: number; endMs: number; sourceStartMs: number; gainDb: number; reason: string }>;
  generationRequests?: Array<{ prompt: string; durationMs: number; loop: boolean; startMs: number; gainDb: number; reason: string }>;
  decision?: "approve" | "revise" | "hold";
}
export interface CrewEvent { role: CrewRole; round: number; prompt: string; output: CrewContribution | null; error: string | null }
export interface CrewResult {
  status: "approved" | "awaiting_assets" | "held" | "incomplete"; summary: string; calls: number;
  contributions: Partial<Record<CrewRole, CrewContribution>>;
}
export interface ReviewMedia { mimeType: string; data: string }
