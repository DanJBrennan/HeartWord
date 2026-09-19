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
  /** Canonical shot verse used to select any story-state-bound references. */
  storyVerseRef?: string;
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
  // startFrame overrides the default "shot's own accepted keyframe" lookup
  // -- needed for a covered_sequence shot's individual beats (see
  // coverage_beats), each of which has its own keyframe distinct from the
  // shot-level one this lookup would otherwise find. durationSeconds
  // overrides the 8s default -- a beat's video should roughly match its
  // own audio span (a 3.5s master doesn't need an 8s clip), not always
  // max out the single-clip ceiling.
  generateFinal(
    request: ShotRequest,
    opts?: { resolution?: "720p" | "1080p"; startFrame?: AssetRef; durationSeconds?: number }
  ): Promise<GenerationResult>;
}

export interface DraftVideoProvider {
  // startFrame: same override purpose as VideoProvider.generateFinal's --
  // without it, generateDraft only has canon character reference images to
  // animate from, not a specific composed shot/beat keyframe.
  generateDraft(request: ShotRequest, opts?: { startFrame?: AssetRef }): Promise<GenerationResult>;
  generateGuided(startFrame: AssetRef, endFrame: AssetRef, request: ShotRequest): Promise<GenerationResult>;
}

export interface LipSyncProvider {
  sync(character: CharacterRef, audio: AudioSegmentRef, referenceFrame: AssetRef): Promise<GenerationResult>;
}
