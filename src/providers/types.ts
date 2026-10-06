/**
 * Provider interfaces — see "Provider interface (v1 shape)" in
 * docs/ARCHITECTURE.md. One interface per media capability, with selectable
 * scene-video adapters (local LTX, Veo and Kling). Pipeline stages depend
 * on these types, never on a
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
  /** Producer-approved visual facts that may not be contradicted by this
   * generation.  Kept with the reference so direct and queued generation
   * share the same locked canon. */
  lockedVisualFacts?: LockedVisualFacts;
};

export type LockedVisualFacts = {
  description: string;
  /** Phrases that must not appear in a generation instruction for this character. */
  prohibitedPromptPhrases: string[];
};

export interface ShotRequest {
  shotId: string;
  prompt: string;
  characters: CharacterRef[];
  /** Approved earlier view of the same location, used only to preserve its
   * production design and geography -- never as a character-canon source. */
  sceneReferences?: AssetRef[];
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
  /** Native environmental audio retained for no-speech review before mixing. */
  ambientAudio?: AssetRef;
  cost: CostRecord;
  provenance: { provider: string; model: string; prompt: string };
  /** Provider-specific, credential-free evidence, also retained with the media. */
  metadata?: Record<string, unknown>;
}

export interface ImageProvider {
  generate(request: ShotRequest, opts?: { tier?: "standard" | "pro" }): Promise<GenerationResult>;
}

export interface ImageEditor {
  /** Targeted region edit (e.g. fixing a modern belt buckle), not a full regeneration. */
  editRegion(asset: AssetRef, instruction: string): Promise<GenerationResult>;
}

/** Render quality/price point for one shot. Mirrors the risk tiers in
 *  pipeline/casting/shot-risk.ts: routine shots take the cheapest render,
 *  critical ones the best. A provider without three real tiers maps these
 *  onto whatever it has. */
export type VideoTier = "economy" | "standard" | "premium";

export interface GenerationProgress {
  phase: string;
  percentage: number | null;
  currentStep: number | null;
  totalSteps: number | null;
  status?: string;
  diagnostic?: string;
}

export interface VideoGenerationOptions {
  resolution?: "540p" | "720p" | "1080p";
  startFrame?: AssetRef;
  durationSeconds?: number;
  fps?: number;
  seed?: number;
  /** Scene audio only; character speech continues through the lip-sync provider. */
  audioMode?: "ambient" | "none";
  tier?: VideoTier;
  /** Absolute destination within the HeartWord asset area. */
  outputPath?: string;
  onProgress?: (progress: GenerationProgress) => void;
}

export interface VideoProvider {
  // startFrame overrides the default "shot's own accepted keyframe" lookup
  // -- needed for a covered_sequence shot's individual beats (see
  // coverage_beats), each of which has its own keyframe distinct from the
  // shot-level one this lookup would otherwise find. durationSeconds
  // overrides the 8s default -- a beat's video should roughly match its
  // own audio span (a 3.5s master doesn't need an 8s clip), not always
  // max out the single-clip ceiling.
  // tier selects the render quality/price point for this specific shot --
  // see pipeline/casting/shot-risk.ts, which derives it from the shot's own
  // crowd/cast/camera/continuity facts. Omitted means the cheapest tier: a
  // caller that has not assessed risk must not silently buy the expensive
  // one.
  generateFinal(
    request: ShotRequest,
    opts?: VideoGenerationOptions
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
