/**
 * Implements the Production Director's approved ideas (see
 * production-director.ts) -- the "includes the authority to generate
 * keyframes and video clips" half of Dan's instruction. Only ever
 * called with ideas that already cleared the negotiation loop.
 *
 * new_shot: generates a real keyframe (Nano Banana Pro, same tier this
 * project uses for canon-critical multi-character shots) using the
 * project's established casting/setting anchor, then real video from
 * that keyframe (generateFinalVideoWithFallback, the same 3-tier Veo/
 * Kling/draft chain every other supplementary shot this session used).
 *
 * reorder_existing/extend_existing are NOT generated here -- they're
 * timeline edits (a splice-order change, or a longer trim/regeneration
 * of an existing shot's own clip), which this project manages as direct
 * edits to the chapter assembly script rather than a database-driven
 * timeline yet (see scripts/assemble-full-chapter-with-inserts.ts).
 * implementApprovedIdeas reports these back as explicit instructions for
 * that manual step instead of silently no-op'ing them.
 */
import type { DatabaseSync } from "node:sqlite";
import { GeminiImageProvider, GeminiDraftVideoProvider, GeminiVideoProvider } from "../../providers/gemini/index.js";
import { KlingVideoProvider } from "../../providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../media-generation/generate-final-with-fallback.js";
import type { GapFillIdea } from "./index.js";
import type { CharacterRef } from "../../providers/types.js";

const CASTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism, not stylized/cartoon/3D). " +
  "CASTING: every person's face, skin tone, and build reads as Hatam/Papuan (Melanesian Arfak highland) -- match the " +
  "attached reference images exactly for any named character. SETTING: first-century Judea/Galilee -- buildings from " +
  "rough dark basalt fieldstone with flat timber/reed/mud roofs, simple first-century tunics, leather sandals. No " +
  "Melanesian/Pacific Islander tribal dress, no modern objects, no text or labels anywhere in the image.";

export interface ImplementedNewShot {
  ideaId: string;
  label: string;
  keyframePath: string;
  videoPath: string;
  videoTier: string;
  costUsd: number;
}

export interface TimelineEditInstruction {
  ideaId: string;
  operation: "reorder_existing" | "extend_existing";
  targetShotVerseRef: string;
  instruction: string;
}

export interface ImplementationResult {
  newShots: ImplementedNewShot[];
  timelineEdits: TimelineEditInstruction[];
  failures: Array<{ ideaId: string; label: string; error: string }>;
}

function resolveCharacterRefs(db: DatabaseSync, names: string[]): CharacterRef[] {
  const refs: CharacterRef[] = [];
  for (const name of names) {
    const row = db
      .prepare(
        `SELECT c.id AS characterId, cv.id AS characterVersionId FROM characters c
         JOIN character_versions cv ON cv.character_id = c.id
         WHERE c.name = ? AND cv.status = 'approved'
         ORDER BY cv.created_at DESC LIMIT 1`
      )
      .get(name) as { characterId: string; characterVersionId: string } | undefined;
    if (row) refs.push(row);
    // A name the LLM used that doesn't match this project's canon exactly
    // is silently skipped rather than thrown -- crowd/group phrasing
    // drift is common and the shot still generates with whichever named
    // characters DID resolve.
  }
  return refs;
}

/**
 * Generates real keyframes/video for every approved new_shot idea, and
 * returns plain-language instructions for every approved reorder/extend
 * idea instead of applying them automatically.
 */
export async function implementApprovedIdeas(db: DatabaseSync, approvedIdeas: GapFillIdea[]): Promise<ImplementationResult> {
  const newShots: ImplementedNewShot[] = [];
  const timelineEdits: TimelineEditInstruction[] = [];
  const failures: Array<{ ideaId: string; label: string; error: string }> = [];

  const imageProvider = new GeminiImageProvider();

  for (const idea of approvedIdeas) {
    if (idea.operation !== "new_shot") {
      // Defensive check even though the Creative Director's own prompt
      // now forbids this (confirmed live: it proposed extending a
      // lip-synced shot before that guard existed) -- a lip-synced
      // shot's length is locked to its real dialogue audio, so
      // "extending" it would desync the mouth from the line.
      if (idea.operation === "extend_existing") {
        const candidates = db
          .prepare(`SELECT needs_lip_sync FROM shots WHERE verse_ref = ?`)
          .all(idea.targetShotVerseRef) as Array<{ needs_lip_sync: number }>;
        // Multiple shots can share one verse_ref label -- if ANY of them
        // is lip-synced, treat the target as ambiguous/risky rather than
        // guess which one was meant.
        if (candidates.some((c) => c.needs_lip_sync)) {
          failures.push({
            ideaId: idea.id,
            label: idea.label,
            error: `Refused: a shot at ${idea.targetShotVerseRef} is lip-synced -- extending it (or an ambiguous same-labeled shot) risks desyncing dialogue audio. Skipped rather than applied.`
          });
          continue;
        }
      }
      timelineEdits.push({
        ideaId: idea.id,
        operation: idea.operation,
        targetShotVerseRef: idea.targetShotVerseRef,
        instruction:
          idea.operation === "extend_existing"
            ? `Extend the shot at ${idea.targetShotVerseRef} by ~${idea.estimatedDurationSec}s: ${idea.description}`
            : `Reorder the shot at ${idea.targetShotVerseRef}: ${idea.description}`
      });
      continue;
    }

    try {
      // The Creative Director doesn't reliably return `label` as the
      // kebab-case slug its own type asks for (confirmed live: "Friends
      // Watching from Roof Aperture" came back title-case with spaces) --
      // every other shotId in this project's generated/ tree is a plain
      // kebab-case slug, and a raw label would land the file at a path
      // with spaces in it, so this is sanitized here rather than trusted.
      const shotId = idea.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const characters = resolveCharacterRefs(db, idea.charactersInvolved);
      const prompt =
        `${CASTING_ANCHOR}\n\nShot: ${idea.framing || "medium"}, ${idea.cameraMovement || "static"} camera.\n` +
        `Setting: ${idea.setting || "match the established location of the surrounding action"}.\n` +
        `Action: ${idea.description}\n` +
        `Characters visible: ${idea.charactersInvolved.join(", ") || "as described"} (each exactly once, matching their reference images where named).`;

      const keyframeResult = await imageProvider.generate({ shotId, prompt, characters }, { tier: "pro" });
      if (keyframeResult.status !== "accepted" || !keyframeResult.media?.path) {
        throw new Error(`Keyframe generation did not produce an accepted result (status: ${keyframeResult.status}).`);
      }

      const videoProvider = new GeminiVideoProvider();
      const klingSceneProvider = new KlingVideoProvider();
      const draftProvider = new GeminiDraftVideoProvider();
      const videoResult = await generateFinalVideoWithFallback(
        videoProvider,
        klingSceneProvider,
        draftProvider,
        { shotId, prompt: idea.description, characters: [] },
        { resolution: "720p", startFrame: { path: keyframeResult.media.path }, durationSeconds: Math.min(8, Math.max(4, Math.round(idea.estimatedDurationSec))) }
      );
      if (!videoResult.media?.path) {
        throw new Error("Video generation did not produce a result.");
      }

      newShots.push({
        ideaId: idea.id,
        label: shotId,
        keyframePath: keyframeResult.media.path,
        videoPath: videoResult.media.path,
        videoTier: videoResult.tier,
        costUsd: (keyframeResult.cost?.usd ?? 0) + (videoResult.cost?.usd ?? 0)
      });
    } catch (err) {
      failures.push({ ideaId: idea.id, label: idea.label, error: (err as Error).message });
    }
  }

  return { newShots, timelineEdits, failures };
}
