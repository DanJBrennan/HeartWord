import type { SavedCutTimingAudit } from "../assembly/cut-timing-audit.js";
import type { EditorialCheck } from "../qc/editorial-review.js";
import type { FilmChange, OwnerResponse, ObjectionResponse, ProductionRecord, SavedContribution } from "./production-record.js";
import type { AcceptedEmotionalTreatment, EmotionalTreatment, EmotionalBeatCheck, TreatmentReview } from "./emotional-treatment.js";
import type { CraftAssessment, CraftResponse, CreativeFeedback } from "./creative-feedback.js";

export const PLANNING_ROLES = [
  "creative_director", "cinematographer", "choreographer", "staging_designer",
  "production_designer", "costume_designer", "lighting_designer",
  "script_supervisor", "picture_editor", "sound_designer", "composer", "scripture_cultural_reviewer"
] as const;
export const FINISHING_ROLES = ["picture_editor", "script_supervisor", "colorist", "sound_designer", "composer",
  "scripture_cultural_reviewer"] as const;
export const EDITING_ROLES = ["creative_director", "picture_editor", "script_supervisor", "scripture_cultural_reviewer"] as const;
export type CrewRole = typeof PLANNING_ROLES[number] | typeof FINISHING_ROLES[number] | "production_director" | "fidelity_challenger" | "clarity_challenger" | "feasibility_challenger";
export type CrewPhase = "planning" | "editing" | "finishing";
export interface AudioPlacement { segmentId: string; sourceStartMs: number; sourceEndMs: number; startMs: number; endMs: number;
  /** Render-audit evidence; absent on an unrendered editorial plan. */
  voice?: "original" | "cast"; speakerId?: string | null;
  /** Exact immutable recording proof for an unassigned gap/tail, not a new
   * reviewed attribution row or a guessed speaker. */
  provenance?: "unassigned_source_interval"; sourcePath?: string; sourceSha256?: string }
export interface EditorialOpeningBeat {
  id: string; label: string; path: string; sha256: string; durationMs: number; startMs: number; endMs: number;
}
export interface PicturePlacement {
  shotId: string | null; startMs: number; endMs: number; sourceStartMs?: number;
  editorialBeatId?: string; path?: string; sha256?: string; label?: string;
}
export interface CrewShot {
  id: string; sceneId: string; sceneSequence: number; sequence: number;
  verseRef: string; action: string; framing: string | null; cameraMovement: string | null;
  continuity: string | null; lighting: string | null; needsLipSync: boolean;
  spatialContinuity?: string | null; spatialView?: string | null; crowdDensity?: string | null;
  characterIds: string[]; dialogueCharacterId: string | null;
  /** Approved utterance identity for an on-camera mouth; required to
   * distinguish repeated speaker/verse lines during editorial timing. */
  sourceSegmentId?: string | null;
  utterance?: { startMs: number; endMs: number; speechRunId?: string };
  beats: Array<{ id: string; sequence: number; notes: string | null; characterId: string | null;
    startMs: number; endMs: number }>;
  clip: { id: string; path: string; durationMs: number } | null;
}
export interface CrewBrief {
  /** Fixed producer-approved pre-source beats, kept outside Scripture shots.
   * The planner prepends them; the Picture Editor edits chapter coverage only. */
  editorialOpening?: EditorialOpeningBeat[];
  /** Accepted nonnarrative post-source titles/credits, with relative timing.
   * Appended after complete chapter coverage and justified pauses. */
  editorialClosing?: EditorialOpeningBeat[];
  /** Saved QC evidence, not producer direction or current asset acceptance. */
  mediaReviewEvidence?: Array<{ id: string; shotId: string; note: string; createdAt: number }>;
  /** Read from the accepted planning run; never inferred for historical films. */
  acceptedEmotionalTreatment?: AcceptedEmotionalTreatment;
  project: { id: string; language: string; book: string; chapter: number };
  source: { text: Array<{ verse: number; text: string }>; reference: Array<{ verse: number; text: string }>;
    hashes: string[] };
  audio: Array<{ id: string; startMs: number; endMs: number; verseRef: string | null;
    speakerId: string | null; path: string; confidence: number | null; provenance?: "unassigned_source_interval"; sourceSpeakerId?: string;
    speechRun?: { id: string; verseRef: string; startMs: number; endMs: number; internalVerseTiming: "approximate" | "unresolved" };
    safePauseAfter?: boolean }>;
  canon: Array<{ id: string; name: string; region: string; versionId: string; notes: string | null; joinedAt: string | null }>;
  shots: CrewShot[];
  producerNotes: Array<{ id: string; subjectId: string; note: string }>;
  appliedLessons?: Array<{ id: string; subjectId: string | null; scopeKind: string; requestedChange: string; rationale: string | null }>;
  spentUsd: number;
  audioAssets: Array<{ id: string; kind: "music" | "sfx"; description: string; path: string;
    sha256: string; durationMs: number }>;
  render: { id: string; path: string; durationMs: number; sha256: string;
    timeline: PicturePlacement[]; audioMap?: AudioPlacement[];
    timingAudit?: SavedCutTimingAudit;
    finishing?: { baseRenderId: string; basePath: string; baseSha256: string; previousDecisions: CrewResult["contributions"] } } | null;
}
export interface CrewFinding {
  shotId: string | null; severity: "blocking" | "advisory";
  evidence: string; requestedChange: string;
  /** Agent estimate for this specific finding; uncalibrated, not severity or authority. */
  confidence: number; limitations: string;
}
export interface CrewContribution {
  craftAssessment?: CraftAssessment;
  creativeResponses?: CraftResponse[];
  acceptanceChecks?: { status: "clear" | "hold" | "unverified"; evidence: string };
  emotionalTreatment?: EmotionalTreatment;
  treatmentReview?: TreatmentReview;
  emotionalBeatChecks?: EmotionalBeatCheck[];
  summary: string;
  directions: Array<{ shotId: string; instruction: string; scriptureBasis: string }>;
  findings: CrewFinding[];
  /** Required from the Picture Editor when reviewing an actual finished cut. */
  editorialChecks?: EditorialCheck[];
  coverageRequests?: Array<{ shotId: string; additionalMs: number; description: string; reason: string }>;
  edits?: Array<{ shotId: string; sourceStartMs: number; durationMs: number }>;
  pauses?: Array<{ afterSegmentId: string | null; durationMs: number; reason: string }>;
  colorAdjustments?: Array<{ shotId: string; brightness: number; contrast: number; saturation: number; reason: string }>;
  audioCues?: Array<{ assetId: string; startMs: number; endMs: number; sourceStartMs: number; gainDb: number; reason: string; fadeInMs?: number; fadeOutMs?: number }>;
  generationRequests?: Array<{ prompt: string; durationMs: number; loop: boolean; startMs: number; gainDb: number; reason: string }>;
  decision?: "approve" | "revise" | "hold";
  decisionConfidence?: number; decisionLimitations?: string;
  /** Proposals use the FDL fact model; receiving owners explicitly review them. */
  filmChanges?: FilmChange[];
  ownerResponses?: OwnerResponse[];
  objectionResponses?: ObjectionResponse[];
  withdrawals?: Array<{contributionId:string;rationale:string;evidence:string}>;
  acceptedContributionIds?: string[];
  /** Assigned by the runtime, never trusted from a model reply. */
  exchange?: SavedContribution[];
}
export interface CrewEvent { role: CrewRole; round: number; prompt: string; output: CrewContribution | null; error: string | null; rejectedOutput?:unknown }
export interface CrewResult {
  creativeFeedback?: CreativeFeedback;
  /** Explicit new-run contract; absent on historical plans, never backfilled. */
  emotionalTreatmentRequired?: true;
  status: "approved" | "awaiting_assets" | "held" | "incomplete"; summary: string; calls: number;
  contributions: Partial<Record<CrewRole, CrewContribution>>;
  productionRecord?: ProductionRecord;
}
/** `caption`, when present, is rendered as its own text part immediately
 *  before this image (see generateJsonWithImages) -- otherwise a model
 *  receiving several images (e.g. per-character canon reference art) has
 *  no way to know which image is which. */
export interface ReviewMedia { mimeType: string; data: string; caption?: string; videoMetadata?: { fps: number } }
