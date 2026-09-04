/**
 * Provider interfaces — see "Provider interface (v1 shape)" in
 * docs/ARCHITECTURE.md. One interface per media capability; v1 has exactly
 * one adapter implementation per interface (src/providers/gemini,
 * src/providers/kling). Pipeline stages depend on these types, never on a
 * specific vendor SDK directly — see the Provider abstraction design
 * principle in ARCHITECTURE.md.
 */

export type AssetRef = {
  /** Path relative to HEARTWORD_DATA_DIR/assets. */
  path: string;
};

export type AudioSegmentRef = {
  path: string;
  startMs: number;
  endMs: number;
};

export type CharacterRef = {
  characterId: string;
  characterVersionId: string;
};

export interface ShotRequest {
  shotId: string;
  prompt: string;
  characters: CharacterRef[];
}

export type GenerationStatus =
  | "accepted"
  | "retry_same"
  | "retry_modified"
  | "escalate"
  | "hold_for_review";

export interface CostRecord {
  usd: number;
}

export interface GenerationResult {
  status: GenerationStatus;
  media?: AssetRef;
  cost: CostRecord;
  provenance: { provider: string; model: string; prompt: string };
}

export interface ImageProvider {
  generate(request: ShotRequest, opts?: { tier?: "standard" | "pro" }): Promise<GenerationResult>;
}

export interface ImageEditor {
  /** Targeted region edit (e.g. fixing a modern belt buckle), not a full regeneration. */
  editRegion(asset: AssetRef, instruction: string): Promise<GenerationResult>;
}

export interface VideoProvider {
  generateFinal(request: ShotRequest, opts?: { resolution?: "720p" | "1080p" }): Promise<GenerationResult>;
}

export interface DraftVideoProvider {
  generateDraft(request: ShotRequest): Promise<GenerationResult>;
  generateGuided(startFrame: AssetRef, endFrame: AssetRef, request: ShotRequest): Promise<GenerationResult>;
}

export interface LipSyncProvider {
  sync(character: CharacterRef, audio: AudioSegmentRef, referenceFrame: AssetRef): Promise<GenerationResult>;
}
