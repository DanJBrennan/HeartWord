import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import type { DraftVideoProvider } from "../../providers/types.js";
import { reviewGeneratedVideo, videoReviewPassed } from "../qc/video-review.js";
import { shotRiskFor } from "./shot-risk-lookup.js";

/**
 * The draft room: cheap 360p Omni passes a producer can compare before
 * committing to a full render -- docs/design/media-generation.md's "Draft
 * Room and Cost-Tiered Generation".
 *
 * Deliberately separate from generateNonSpeakingVideoCandidate, which
 * still holds exactly one final-render candidate at a time. A draft and a
 * final are different things: drafts are for choosing, and several coexist
 * on purpose; a final is the deliverable, and a second one pending review
 * means an unreconciled decision. They are kept apart by
 * generation_attempts.operation ('generate_draft' vs
 * 'generate_final_video'), which also keeps drafts out of the
 * orchestrator's "does this shot have footage yet" check -- a draft is
 * never deliverable footage.
 */

/**
 * How many drafts may be held at once for one shot. At roughly $0.26 for
 * an 8s Omni draft, three is about $0.78 -- still less than the single
 * premium render ($1.60) the draft room exists to avoid wasting, which is
 * the only reason drafting first is worth doing at all. Raising this past
 * the cost of the render it protects would defeat the purpose.
 */
export const MAX_HELD_DRAFTS = 3;

export async function generateShotDraft(
  db: DatabaseSync,
  projectId: string,
  shotId: string,
  draftProvider: DraftVideoProvider
) {
  const shot = db.prepare(
    `SELECT sh.id, sh.action FROM shots sh JOIN scenes s ON s.id = sh.scene_id
     WHERE sh.id = ? AND s.project_id = ? AND sh.needs_lip_sync = 0`
  ).get(shotId, projectId) as { id: string; action: string } | undefined;
  if (!shot) throw new Error("Only a non-speaking shot in this project can be drafted.");
  const dataDir = getDataDir();

  const settled = db.prepare(
    `SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id = c.generation_attempt_id
     WHERE c.shot_id = ? AND ga.status = 'accepted'`
  ).get(shotId) as { id: string } | undefined;
  if (settled) return { status: "settled" as const, clipId: settled.id };

  const chosen = db.prepare(
    "SELECT id FROM generation_attempts WHERE shot_id = ? AND operation = 'generate_draft' AND status = 'accepted' LIMIT 1"
  ).get(shotId) as { id: string } | undefined;
  if (chosen) return { status: "chosen" as const, attemptId: chosen.id };

  const held = db.prepare(
    "SELECT id FROM generation_attempts WHERE shot_id = ? AND operation = 'generate_draft' AND status = 'hold_for_review' ORDER BY created_at"
  ).all(shotId) as Array<{ id: string }>;
  if (held.length >= MAX_HELD_DRAFTS) {
    return {
      status: "at_capacity" as const,
      heldAttemptIds: held.map(row => row.id),
      reason: `${held.length} drafts are already held for this shot; choose one before drafting again.`
    };
  }

  // Same accepted keyframe every draft animates from, so what differs
  // between them is the motion and staging being judged, not the frame.
  const keyframe = db.prepare(
    `SELECT result_asset_path, prompt FROM generation_attempts
     WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' AND result_asset_path IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`
  ).get(shotId) as { result_asset_path: string; prompt: string | null } | undefined;
  if (!keyframe) throw new Error("Drafting is held: this shot needs an accepted reviewed keyframe.");

  const characters = db.prepare(
    `SELECT sc.character_id characterId, cv.id characterVersionId, c.name FROM shot_characters sc
     JOIN character_versions cv ON cv.character_id = sc.character_id AND cv.status = 'approved'
     JOIN characters c ON c.id = sc.character_id
     WHERE sc.shot_id = ?`
  ).all(shotId) as Array<{ characterId: string; characterVersionId: string; name: string }>;

  // Omni derives its output filename from request.shotId.  A draft room
  // deliberately permits several takes for one underlying shot, so passing
  // the bare shot id would overwrite the preceding take on disk.  Use the
  // immutable attempt id for the provider-facing label while retaining the
  // actual shot id in generation_attempts.
  const id = randomUUID(), now = Date.now();
  // Gemini's video endpoint rejects named real-person likeness references.
  // The reviewed keyframe remains the sole visual identity anchor; text uses
  // role language so an historical character's name is not sent upstream.
  const safeAction = redactCharacterNames(shot.action, characters.map(character => character.name));
  const draftPrompt = `Animate the supplied approved start frame. Preserve its exact people, Papuan/Hatam wardrobe, setting, camera framing, and action: ${safeAction}

NON-SPEAKING VIDEO RULE: This is a non-speaking shot. Do not generate dialogue, narration, singing, lip-sync performance, intelligible words, or visible mouth movements that suggest speech from any person. Preserve only natural nonverbal action and background ambience. The chapter narration is a separate audio layer and must not be visually performed here. Every visible person must retain the approved Papuan/Hatam casting; named characters must retain their exact approved canon face, hair, skin tone, build, and wardrobe throughout the entire clip. Do not drift toward Caucasian, Levantine, or generic substitute identities.

NATURAL CROWD MOTION RULE: People in a crowd move on independent, staggered timings. At most a few people may reach, shift, or react at once while others hold, breathe, look, edge forward, or respond subtly at different moments. Never generate a synchronized wave of arms, a repeated group gesture, mirrored movement, or a mass simultaneous reach-and-retract.`;
  const result = await draftProvider.generateDraft(
    // Do not attach named canonical reference sheets: the accepted frame is
    // the identity reference for video generation and avoids Gemini's block.
    { shotId: `${shot.id}-draft-${id}`, prompt: draftPrompt, characters: [] },
    { startFrame: { path: keyframe.result_asset_path } }
  );

  const risk = shotRiskFor(db, shotId);
  db.prepare(
    `INSERT INTO generation_attempts (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, ?, ?, 'generate_draft', '360p', ?, 'hold_for_review', ?, ?, ?)`
  ).run(id, shotId, result.provenance.provider, result.provenance.model, result.provenance.prompt,
    result.media?.path ?? null, result.cost.usd, now);
  db.prepare(
    "INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(randomUUID(), projectId, id, result.cost.usd, now);

  // Every draft arrives with a verdict attached rather than a bare "please
  // look at this" -- the automated half of the evaluation
  // docs/design/media-generation.md asks for. The verdict never decides:
  // a failed draft stays choosable, because the producer is comparing
  // takes and an uncalibrated confidence score should not veto that. A
  // review that cannot run must not destroy a draft that already exists
  // and is already paid for, so its failure is recorded and nothing else.
  let reviewNote = "not reviewed";
  if (result.media) {
    try {
      const review = await reviewGeneratedVideo({
        videoPath: join(dataDir, "assets", result.media.path),
        keyframePath: join(dataDir, "assets", keyframe.result_asset_path),
        instruction: keyframe.prompt ?? shot.action
      });
      db.prepare(
        "INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(randomUUID(), projectId, id, review.costUsd, Date.now());
      reviewNote = `${videoReviewPassed(review.verdict) ? "passed" : "FAILED"} automated review (confidence ${review.verdict.confidence}): ${review.verdict.reason}`;
    } catch (error) {
      reviewNote = `automated review could not run: ${(error as Error).message}`;
    }
  }

  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`
  ).run(randomUUID(), projectId, shotId,
    `Draft ${id} (${held.length + 1} of at most ${MAX_HELD_DRAFTS}) for review. Shot risk ${risk.tier}: ${risk.reasons.join("; ")}. Draft ${reviewNote}.`, Date.now());

  return { status: "draft" as const, attemptId: id, heldCount: held.length + 1, review: reviewNote };
}

function redactCharacterNames(text: string, names: string[]) {
  let result = text;
  for (const name of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), /jesus/i.test(name) ? "the central teacher" : "a follower");
  }
  return result;
}

/**
 * Records which held draft the producer picked. The others stay held as
 * history rather than being deleted or silently rewritten -- the same
 * append-only discipline the alignment evidence tables use.
 *
 * Choosing a draft does not itself produce deliverable footage: no clip
 * row is written, because a 360p draft is not the finished shot. It
 * records the composition to commit to, and the full render still runs
 * through generateNonSpeakingVideoCandidate.
 */
export function chooseShotDraft(db: DatabaseSync, projectId: string, attemptId: string) {
  const row = db.prepare(
    `SELECT ga.id, ga.shot_id, ga.status FROM generation_attempts ga
     JOIN shots sh ON sh.id = ga.shot_id JOIN scenes s ON s.id = sh.scene_id
     WHERE ga.id = ? AND s.project_id = ? AND ga.operation = 'generate_draft'`
  ).get(attemptId, projectId) as { id: string; shot_id: string; status: string } | undefined;
  if (!row) throw new Error("That draft is not in this project.");
  if (row.status !== "hold_for_review") throw new Error("Only a held draft can be chosen.");

  const alreadyChosen = db.prepare(
    "SELECT id FROM generation_attempts WHERE shot_id = ? AND operation = 'generate_draft' AND status = 'accepted' LIMIT 1"
  ).get(row.shot_id) as { id: string } | undefined;
  if (alreadyChosen) throw new Error("This shot already has a chosen draft.");

  db.prepare("UPDATE generation_attempts SET status = 'accepted' WHERE id = ? AND status = 'hold_for_review'").run(attemptId);
  const remaining = db.prepare(
    "SELECT COUNT(*) AS n FROM generation_attempts WHERE shot_id = ? AND operation = 'generate_draft' AND status = 'hold_for_review'"
  ).get(row.shot_id) as { n: number };
  return { attemptId, shotId: row.shot_id, remainingHeld: Number(remaining.n) };
}
