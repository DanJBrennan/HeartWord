import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { GeminiImageProvider } from "../../providers/gemini/index.js";
import type { CharacterRef } from "../../providers/types.js";
import type { ProjectRow } from "../ingestion/index.js";
import { runShotReview } from "../qc/director.js";
import type { Stage } from "../types.js";

interface ShotRow {
  id: string;
  scene_id: string;
  sequence: number;
  action: string;
  framing: string | null;
  camera_movement: string | null;
  needs_lip_sync: number;
  crowd_density: string | null;
  continuity_notes: string | null;
}

interface SceneRow {
  id: string;
  sequence: number;
  lighting_continuity: string | null;
}

interface ShotCharacterRow {
  character_id: string;
  character_version_id: string;
  name: string;
}

const imageProvider = new GeminiImageProvider();

const FRAMING_DESCRIPTIONS: Record<string, string> = {
  wide: "wide shot establishing the whole location",
  medium_wide: "medium-wide shot, several figures full-length",
  medium: "medium shot, waist-up",
  medium_close: "medium-close shot, chest-up, face clearly visible",
  close_up: "close-up, full face",
  insert: "tight insert detail shot"
};

const CROWD_DENSITY_INSTRUCTIONS: Record<string, string> = {
  empty: "This location is EMPTY except for the named characters above -- no background figures.",
  sparse: "A few background figures only -- this location is not busy.",
  moderate: "A normal, moderately populated scene -- neither empty nor overcrowded.",
  packed:
    "This location is PACKED, at or beyond capacity -- fill the frame with many background figures shoulder to " +
    "shoulder, including in doorways and openings, with no empty floor space. If the action describes 'no room' " +
    "or an overflowing crowd, render that literally -- a modestly-sized gathering is a failure here, not a " +
    "reasonable interpretation."
};

/**
 * Casting/setting anchor, corrected 2026-09-06 after Dan caught the
 * original version -- "first-century Hatam/Papuan (Melanesian Arfak
 * highland) setting" -- rendering as Melanesian/Pacific Islander tribal
 * dress (woven grass skirts, bare chests, shell/bone arm bands, bare
 * feet) instead of first-century Judean clothing. That single sentence
 * conflated two things PRODUCT_VISION.md's own "Visual World and
 * Character Direction" section already keeps separate and explicit:
 * Papuan CASTING (faces, skin tone) vs. first-century Judean/Galilean
 * SETTING (clothing, architecture, props) -- "the clothing, trees, and
 * buildings do not need to be transplanted to modern Papua." This was a
 * bug in how that already-documented vision got translated into a
 * generation prompt, not a missing design decision.
 */
const CASTING_AND_SETTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism -- do not stylize, " +
  "cartoon, paint, or render as 3D animation). CASTING: every person's face, skin tone, and build should read as " +
  "Hatam/Papuan (Melanesian Arfak highland) -- match the attached reference images exactly for any named " +
  "character. SETTING (do not let the casting choice influence this): first-century Judea/Galilee, historically " +
  "coherent -- mudbrick or stone village architecture, simple first-century tunics and robes with sashes, " +
  "leather sandals, head coverings where appropriate. Do NOT render any Melanesian, Pacific Islander, or " +
  "African tribal clothing, adornment, or setting -- no grass or woven-fiber skirts, no bare chests as everyday " +
  "dress, no shell/bone/wood jewelry or arm bands, no face or body paint, no tropical island scenery. The people " +
  "are Papuan; the world around them is first-century Judea, exactly as it would be for any other casting.";

function buildShotPrompt(scene: SceneRow, shot: ShotRow, characterNames: string[]): string {
  const framing = shot.framing ? (FRAMING_DESCRIPTIONS[shot.framing] ?? shot.framing) : "medium shot";
  const crowdInstruction = shot.crowd_density
    ? (CROWD_DENSITY_INSTRUCTIONS[shot.crowd_density] ?? CROWD_DENSITY_INSTRUCTIONS.moderate)
    : CROWD_DENSITY_INSTRUCTIONS.moderate;

  return `${CASTING_AND_SETTING_ANCHOR}

Scene setting: ${scene.lighting_continuity ?? "natural daylight, consistent with the rest of the scene"}.

Shot: ${framing}, camera ${shot.camera_movement ?? "static"}.
Action: ${shot.action}

Population/crowd: ${crowdInstruction}
${shot.continuity_notes ? `\nIMPORTANT continuity constraint for this exact shot: ${shot.continuity_notes}\n` : ""}
Characters visible in this shot (use the attached reference image(s) for exact likeness -- same face, build, and clothing as shown; do not redesign them): ${
    characterNames.length > 0 ? characterNames.join(", ") : "none named -- establishing/background shot"
  }.

No text, no labels, no logos anywhere in the image.`;
}

/**
 * Stage 4: Media generation -- generates one keyframe still image per shot
 * via Nano Banana / Nano Banana Pro (src/providers/gemini/index.ts's
 * GeminiImageProvider), grounded in each visible character's approved
 * canon reference image so likeness stays consistent with the character
 * library rather than drifting shot to shot.
 *
 * v1 scope is keyframes only, not video:
 * - A shot with needs_lip_sync stops here -- stage 5's LipSyncProvider will
 *   consume this keyframe as its referenceFrame once that provider method
 *   is implemented.
 * - A shot without needs_lip_sync also only gets a keyframe for now --
 *   turning that into an actual video clip (VideoProvider.generateFinal,
 *   a `clips` row) is a separate follow-up once that provider method
 *   exists. Writing a `clips` row here would be premature: a clip is
 *   timeline-placed video with a real duration (see schema.sql), and a
 *   still image isn't that yet.
 *
 * Tier: "pro" (Nano Banana Pro) for any shot with needs_lip_sync, since a
 * weak keyframe there costs a wasted downstream Kling lip-sync call, not
 * just a weak still image -- "standard" for everything else, matching
 * PRODUCT_VISION.md's "routine vs. canon-critical" cost-tiering for image
 * generation.
 *
 * Idempotent/reuse: a shot that already has an accepted generation attempt
 * whose result file still exists on disk is skipped rather than
 * regenerated -- same reuse-if-exists pattern as voicing.ts, since each
 * call is a real Gemini charge.
 *
 * Automated QC (added 2026-09-07): every shot generated fresh by this run
 * (not a reused one -- it's already been reviewed) is immediately handed
 * to qc/director.ts's runShotReview, which runs the Critic's grounded
 * research pass plus the canonical-likeness and scene-fidelity checks. A
 * non-'accepted' verdict overwrites that shot's generation_attempts.status,
 * so the reuse-if-exists check above naturally regenerates it the next
 * time this stage runs -- no separate manual audit step required. A
 * review call that itself fails (e.g. a network error) doesn't fail the
 * shot's generation; it's logged to review_notes so it isn't silently lost.
 *
 * VISUAL STYLE: photorealistic, matching the established character canon
 * (Jesus, the Twelve, both Mark 2 groups). An earlier "Pixar-style 3D"
 * direction, once referenced by docs/ARCHITECTURE.md and docs/design/
 * media-generation.md, was considered and rejected by Dan (2026-09-06) --
 * both docs corrected to remove it.
 */
export const runMediaGeneration: Stage = async (projectId) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;
  if (!project) {
    return { ok: false, reasoning: `Media generation failed: no project with id ${projectId}.` };
  }

  const shots = db
    .prepare(
      `SELECT s.id, s.scene_id, s.sequence, s.action, s.framing, s.camera_movement, s.needs_lip_sync,
              s.crowd_density, s.continuity_notes
       FROM shots s JOIN scenes sc ON sc.id = s.scene_id
       WHERE sc.project_id = ? ORDER BY sc.sequence, s.sequence`
    )
    .all(project.id) as unknown as ShotRow[];

  if (shots.length === 0) {
    return { ok: false, reasoning: "Media generation failed: no shots found -- run casting (stage 3) first." };
  }

  const scenes = db
    .prepare(`SELECT id, sequence, lighting_continuity FROM scenes WHERE project_id = ?`)
    .all(project.id) as unknown as SceneRow[];
  const sceneById = new Map(scenes.map((s) => [s.id, s]));

  const charStmt = db.prepare(
    `SELECT c.id AS character_id, cv.id AS character_version_id, c.name
     FROM shot_characters sc
     JOIN characters c ON c.id = sc.character_id
     JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
     WHERE sc.shot_id = ?`
  );

  const dataDir = getDataDir();
  const insertAttempt = db.prepare(
    `INSERT INTO generation_attempts
       (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, ?, ?, 'generate', NULL, ?, ?, ?, ?, ?)`
  );
  const insertCostEntry = db.prepare(
    `INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const updateShotStatus = db.prepare(`UPDATE shots SET status = ? WHERE id = ?`);
  const findExistingAttempt = db.prepare(
    `SELECT result_asset_path FROM generation_attempts
     WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted'
     ORDER BY created_at DESC LIMIT 1`
  );
  const insertReviewNote = db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`
  );

  let generated = 0;
  let reused = 0;
  let failed = 0;
  let heldForReview = 0;
  let reviewFailed = 0;
  const failures: string[] = [];
  const heldShots: string[] = [];

  for (const shot of shots) {
    const existing = findExistingAttempt.get(shot.id) as { result_asset_path: string | null } | undefined;
    if (existing?.result_asset_path && existsSync(join(dataDir, "assets", existing.result_asset_path))) {
      reused++;
      continue;
    }

    const scene = sceneById.get(shot.scene_id) ?? { id: shot.scene_id, sequence: 0, lighting_continuity: null };
    const shotCharacters = charStmt.all(shot.id) as unknown as ShotCharacterRow[];
    const characterRefs: CharacterRef[] = shotCharacters.map((c) => ({
      characterId: c.character_id,
      characterVersionId: c.character_version_id
    }));

    const prompt = buildShotPrompt(scene, shot, shotCharacters.map((c) => c.name));
    const tier: "standard" | "pro" = shot.needs_lip_sync ? "pro" : "standard";

    try {
      const result = await imageProvider.generate({ shotId: shot.id, prompt, characters: characterRefs }, { tier });
      const now = Date.now();
      const attemptId = randomUUID();
      insertAttempt.run(
        attemptId,
        shot.id,
        tier === "pro" ? "nano_banana_pro" : "nano_banana",
        result.provenance.model,
        prompt,
        result.status,
        result.media?.path ?? null,
        result.cost.usd,
        now
      );
      insertCostEntry.run(randomUUID(), project.id, attemptId, result.cost.usd, now);
      updateShotStatus.run("keyframe_generated", shot.id);
      generated++;

      if (result.status === "accepted" && result.media?.path) {
        try {
          const review = await runShotReview(shot.id);
          if (review.decision.status !== "accepted") {
            heldForReview++;
            heldShots.push(`scene ${scene.sequence} shot ${shot.sequence} (${review.decision.status})`);
          }
        } catch (reviewErr) {
          reviewFailed++;
          const message = (reviewErr as Error).message;
          insertReviewNote.run(
            randomUUID(),
            project.id,
            shot.id,
            `Automated QC review could not run for this shot: ${message}`,
            Date.now()
          );
        }
      }
    } catch (err) {
      failed++;
      const message = (err as Error).message;
      failures.push(`scene ${scene.sequence} shot ${shot.sequence}: ${message}`);
      insertReviewNote.run(randomUUID(), project.id, shot.id, `Media generation failed for this shot: ${message}`, Date.now());
    }
  }

  return {
    ok: failed === 0,
    reasoning:
      `Media generation for ${project.book} ${project.chapter}: ${generated} keyframe(s) generated via Nano Banana` +
      `${failed > 0 || generated > 0 ? "/Pro (tiered by needs_lip_sync)" : ""}, ${reused} reused from a prior run` +
      (failed > 0 ? `, ${failed} failed (flagged in review_notes): ${failures.join(" | ")}` : "") +
      `. Each newly generated keyframe was automatically reviewed by the Critic/Director QC pass: ` +
      `${heldForReview} flagged for regeneration or human review` +
      (heldShots.length > 0 ? ` (${heldShots.join(" | ")})` : "") +
      (reviewFailed > 0 ? `, ${reviewFailed} review(s) could not run (flagged in review_notes)` : "") +
      ". Flagged shots will be regenerated automatically the next time this stage runs." +
      " Still images only (v1 scope) -- no video clips yet: a needs_lip_sync shot's keyframe becomes stage 5's " +
      "referenceFrame once LipSyncProvider is implemented, and turning a non-lip-sync shot's keyframe into an " +
      "actual video clip is a separate follow-up (VideoProvider.generateFinal not yet implemented)."
  };
};
