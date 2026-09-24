/**
 * Automated setting/costume/continuity fidelity check -- catches the class
 * of error canonical-likeness.ts doesn't: canonical-likeness judges
 * whether a character's FACE matches their reference; this judges whether
 * everything else in the shot (clothing, architecture, crowd size, scene-
 * to-scene continuity) matches the story and the vision, since a shot can
 * pass every character's likeness check and still be wrong in every other
 * way. Built 2026-09-06 after Dan caught three real, separate failures in
 * one review pass:
 *
 * 1. Mark 2:1-2's "no room, not even at the door" rendering as a modestly
 *    populated room -- nothing told stage 4 HOW crowded "crowded" meant,
 *    so it under-populated the shot.
 * 2. Shot 1 of that same scene already showing the roof opening, even
 *    though the friends don't cut it open until shot 2 -- a continuity
 *    break with no mechanism to catch it.
 * 3. Scene 2's seashore shot dressing everyone in Melanesian/Pacific
 *    Islander tribal clothing (grass skirts, bare chests, shell/bone arm
 *    bands) instead of first-century Judean dress -- traced to
 *    media-generation/index.ts's prompt conflating Papuan CASTING with
 *    Papuan SETTING, now fixed there (see CASTING_AND_SETTING_ANCHOR).
 *
 * (1) and (2) are now addressed upstream too -- stage 3 (casting) plans a
 * crowdDensity and continuityNotes per shot (see casting/index.ts and
 * coverage.ts's CrowdDensity type) that stage 4 turns into an explicit
 * instruction -- but a planning-time instruction and a prompt fix don't
 * guarantee the image model actually complies. This check verifies the
 * generated image itself, the same "trust but verify" the rest of this
 * codebase already applies to Gemini's other structured outputs.
 *
 * Same pure/impure split as canonical-likeness.ts, for the same reason
 * (a vitest unit test importing DB-touching code fails to load):
 * - Pure: fidelity-verdict.ts. See scene-fidelity.test.ts.
 * - Real (this file): checkSceneFidelity (one Gemini vision call per
 *   shot) and runSceneFidelityAudit (the project-wide runner -- flags and
 *   invalidates a failing shot's keyframe the same way
 *   canonical-likeness.ts's audit does, so stage 4's normal reuse-if-
 *   exists logic regenerates it).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { generateJsonWithImages, type GeminiJsonSchema } from "../../providers/gemini-text.js";
import { runMediaGeneration } from "../media-generation/index.js";
import {
  type FidelityVerdict,
  isSceneFidelityAligned,
  parseFidelityVerdict,
  SETTING_FIDELITY_THRESHOLD
} from "./fidelity-verdict.js";

export { isSceneFidelityAligned, parseFidelityVerdict, SETTING_FIDELITY_THRESHOLD, type FidelityVerdict };

const FIDELITY_RESPONSE_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    settingScore: {
      type: "number",
      description:
        "0-100: does the clothing, architecture, and props read as historically coherent first-century Judea/ " +
        "Galilee -- simple tunics/robes, sandals, mudbrick or stone buildings? Score LOW if you see Melanesian/ " +
        "Pacific Islander/African tribal clothing or adornment (grass or woven-fiber skirts, bare chests as " +
        "everyday dress, shell/bone/wood jewelry or arm bands, face/body paint, tropical island scenery) -- " +
        "these should never appear regardless of the actors' ethnicity/casting, which is a separate, correct " +
        "choice this score does NOT penalize. Judge setting/costume only, not faces."
    },
    crowdDensityMatch: {
      type: "boolean",
      description: "Does the number of people actually visible in the image match the REQUIRED crowd density stated below? true if it matches or no specific density was required."
    },
    actionMatch: {
      type: "boolean",
      description: "Does the visible action depict the exact planned moment below, without substituting an earlier/later generic event such as an arrival, departure, doorway crossing, or confrontation?"
    },
    continuityViolation: {
      type: "boolean",
      description: "Does the image violate the CONTINUITY CONSTRAINT stated below (show something that shouldn't be there yet, or omit something that should already be established)? false if it's respected or no constraint was given."
    },
    notes: {
      type: "string",
      description: "One or two sentences on anything found wrong, or a brief confirmation everything checks out."
    }
  },
  required: ["settingScore", "crowdDensityMatch", "actionMatch", "continuityViolation", "notes"]
};

/** Compares one generated shot against its own planned requirements
 *  (crowd density, continuity constraint) and the production's standing
 *  setting rule (first-century Judea regardless of cast). */
export async function checkSceneFidelity(
  generatedImagePath: string,
  action: string,
  requiredCrowdDensity: string | null,
  continuityConstraint: string | null
): Promise<FidelityVerdict> {
  const generatedImage = { mimeType: "image/png", data: readFileSync(generatedImagePath).toString("base64") };

  const prompt =
    `You are a continuity and setting reviewer for a Scripture video production. The physical setting must always ` +
    `read as historically coherent first-century Judea/Galilee (clothing, architecture, props) regardless of the ` +
    `actors' Papuan/Melanesian casting, which is a deliberate, correct choice for FACES only -- see the vision's own ` +
    `"the clothing, trees, and buildings do not need to be transplanted" principle.\n\n` +
    `This shot's planned action: "${action}"\n` +
    `Required crowd density for this shot: ${requiredCrowdDensity ?? "not specified -- any density is fine"}\n` +
    `Continuity constraint for this exact shot: ${continuityConstraint ?? "none specified"}\n\n` +
    `Judge the attached image against all four: setting/costume fidelity, crowd density match, exact action ` +
    `match, and the continuity constraint. Reject a visually plausible frame when it depicts a different ` +
    `causal moment than the planned action.`;

  const verdict = await generateJsonWithImages<FidelityVerdict>(prompt, [generatedImage], FIDELITY_RESPONSE_SCHEMA);
  return parseFidelityVerdict(verdict);
}

interface ShotFidelityRow {
  id: string;
  action: string;
  crowd_density: string | null;
  continuity_notes: string | null;
  generation_attempt_id: string;
  generated_path: string;
}

export interface SceneFidelityAuditResult {
  checked: number;
  passed: number;
  failed: number;
  regenerated: number;
  failures: Array<{ shotId: string; verdict: FidelityVerdict }>;
}

/**
 * Audits every shot in a project that has an accepted stage-4 keyframe.
 * Same invalidate-and-optionally-regenerate loop as
 * canonical-likeness.ts's runCanonicalLikenessAudit -- see that module's
 * docstring for the reasoning (review_notes flag, generation_attempts
 * marked 'retry_modified' so stage 4's reuse-if-exists logic regenerates
 * it, optional re-check to confirm a regeneration actually fixed it).
 */
export async function runSceneFidelityAudit(
  projectId: string,
  opts: { regenerate?: boolean } = {}
): Promise<SceneFidelityAuditResult> {
  const db = getDb();
  const dataDir = getDataDir();

  const rows = db
    .prepare(
      `SELECT s.id, s.action, s.crowd_density, s.continuity_notes,
              ga.id AS generation_attempt_id, ga.result_asset_path AS generated_path
       FROM shots s
       JOIN scenes sc ON sc.id = s.scene_id
       JOIN generation_attempts ga ON ga.shot_id = s.id AND ga.operation = 'generate' AND ga.status = 'accepted'
       WHERE sc.project_id = ?
       ORDER BY s.sequence`
    )
    .all(projectId) as unknown as ShotFidelityRow[];

  const now = Date.now();
  const invalidateAttempt = db.prepare(`UPDATE generation_attempts SET status = 'retry_modified' WHERE id = ?`);
  const insertReviewNote = db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`
  );

  let checked = 0;
  let passed = 0;
  const failures: SceneFidelityAuditResult["failures"] = [];

  for (const row of rows) {
    const generatedAbsPath = join(dataDir, "assets", row.generated_path);
    if (!existsSync(generatedAbsPath)) continue;

    checked++;
    const verdict = await checkSceneFidelity(generatedAbsPath, row.action, row.crowd_density, row.continuity_notes);
    if (isSceneFidelityAligned(verdict)) {
      passed++;
      continue;
    }

    failures.push({ shotId: row.id, verdict });
    invalidateAttempt.run(row.generation_attempt_id);
    const problems: string[] = [];
    if (verdict.settingScore < SETTING_FIDELITY_THRESHOLD) problems.push(`setting/costume scored ${verdict.settingScore}/100`);
    if (!verdict.crowdDensityMatch) problems.push(`crowd density doesn't match the required "${row.crowd_density}"`);
    if (!verdict.actionMatch) problems.push(`visible action doesn't match the planned moment`);
    if (verdict.continuityViolation) problems.push(`continuity constraint violated`);
    insertReviewNote.run(
      randomUUID(),
      projectId,
      row.id,
      `Scene fidelity check: ${problems.join("; ")} -- ${verdict.notes}`,
      now
    );
  }

  let regenerated = 0;
  if (opts.regenerate && failures.length > 0) {
    await runMediaGeneration(projectId);
    const stillFailing: SceneFidelityAuditResult["failures"] = [];
    for (const failure of failures) {
      const row = rows.find((r) => r.id === failure.shotId);
      if (!row) continue;
      const newAttempt = db
        .prepare(
          `SELECT result_asset_path FROM generation_attempts
           WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(failure.shotId) as { result_asset_path: string } | undefined;
      if (!newAttempt) continue;
      const newGeneratedAbsPath = join(dataDir, "assets", newAttempt.result_asset_path);
      const recheck = await checkSceneFidelity(newGeneratedAbsPath, row.action, row.crowd_density, row.continuity_notes);
      if (isSceneFidelityAligned(recheck)) {
        regenerated++;
      } else {
        stillFailing.push({ shotId: failure.shotId, verdict: recheck });
      }
    }
    failures.length = 0;
    failures.push(...stillFailing);
  }

  return { checked, passed, failed: failures.length, regenerated, failures };
}
