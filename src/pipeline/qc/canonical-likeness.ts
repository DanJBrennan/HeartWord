/**
 * Automated canonical-likeness check: does a generated keyframe actually
 * show the SAME person as a character's approved canon reference image,
 * or has it drifted toward a more generic face? Built 2026-09-06 after
 * Dan caught real drift in Jesus's generated keyframes (most visible in a
 * wide shot, where his face read noticeably more generic/Mediterranean
 * than his canon headshot while surrounding cast members kept their
 * correct Melanesian likeness) -- see src/providers/gemini/index.ts's
 * loadCharacterReferenceImages for the reference-image-loading fix this
 * same drift prompted.
 *
 * This is one concrete dimension of the "evolving, learned rubric" v1
 * deliberately defers in full -- see docs/design/automated-quality-
 * control.md and ARCHITECTURE.md's "v1 simplification" callout for stage
 * 7 (QC). Built as its own standalone module rather than wired into
 * stage 7 (still a stub, per that deferral) for the same reason
 * voicing.ts runs standalone rather than through the orchestrator: Dan
 * asked for this specific check directly, not the full rubric.
 *
 * Split the same way coverage.ts and build-scenes.ts split pure decision
 * logic from DB/network glue, so the decision logic is unit-testable
 * without a real Gemini call -- and, concretely, because a plain vitest
 * unit test importing this file directly failed to load at all
 * ("Failed to load url sqlite") once it pulled in db/client.ts's
 * node:sqlite import transitively:
 * - Pure: likeness-verdict.ts (parseLikenessVerdict, isLikenessAligned,
 *   LIKENESS_THRESHOLD) -- zero DB/network imports. See
 *   canonical-likeness.test.ts.
 * - Real (this file): checkCanonicalLikeness (one Gemini vision call per
 *   character/image pair) and runCanonicalLikenessAudit (the project-wide
 *   runner:
 *   finds every shot with an accepted keyframe, checks each character
 *   visible in it against their canon reference, flags and invalidates
 *   any failure so stage 4's normal reuse-if-exists logic regenerates it
 *   on the next runMediaGeneration call, then re-checks to confirm the
 *   fix actually worked).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { generateJsonWithImages, type GeminiJsonSchema } from "../../providers/gemini-text.js";
import { runMediaGeneration } from "../media-generation/index.js";
import {
  isLikenessAligned,
  LIKENESS_THRESHOLD,
  parseLikenessVerdict,
  type LikenessVerdict,
  type WardrobeStatus
} from "./likeness-verdict.js";
import { findFailedShotCharacterRow, type ShotCharacterCheckRow } from "./canonical-likeness-row.js";
import {assertWardrobeReviewBasis} from "../../characters/wardrobe-refinement.js";

export { isLikenessAligned, LIKENESS_THRESHOLD, parseLikenessVerdict, type LikenessVerdict, type WardrobeStatus };

const LIKENESS_RESPONSE_SCHEMA: GeminiJsonSchema = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description:
        "0-100: how closely the SECOND image's depiction of this character matches the FIRST image's specific " +
        "identity -- facial structure (nose, jaw, brow), skin tone, and regional/ethnic appearance. Ignore " +
        "differences in pose, expression, lighting, angle, or clothing -- judge identity only. 100 = clearly the " +
        "same specific person. 0 = a completely different-looking person."
    },
    instanceCount: {
      type: "number",
      description:
        "How many separate figures in the SECOND image appear to be this same character -- count distinct " +
        "figures, not how many times you can see part of them. Judge this using BOTH face AND the character's " +
        "locked canon markers from the reference image (their specific robe/clothing color combination, layering, " +
        "and hair length/style) -- clothing is often the clearer signal at an angle, distance, or partial view " +
        "where the face alone is ambiguous, and a locked canon color-block is a deliberate identity marker for " +
        "this production, not incidental styling. Two figures wearing the exact same distinctive robe/clothing " +
        "combination as the reference, even with faces not both clearly visible, IS a duplicate -- do not wave it " +
        "off as 'similar clothing' on two different people; a canon character's clothing combination should be " +
        "unique to them in this cast, so a match is a real signal, not a coincidence. Almost always 1. If you see " +
        "what looks like the same person appearing twice as two separate figures in the scene (a real generation " +
        "bug), report 2. Report 0 if the character isn't identifiable at all."
    },
    wardrobeStatus: {
      type: "string",
      description:
        "One of: match, mismatch, not_visible. Compare the named character's visible wardrobe directly to the " +
        "approved reference: garment silhouette/cut, layering and mantle arrangement, color-block and bands, " +
        "neckline, fringe/tassel count and length, and visible footwear. Use mismatch for any material visible " +
        "difference, not_visible only when the clothing cannot honestly be assessed."
    },
    wardrobeNotes: {
      type: "string",
      description:
        "One or two sentences naming the visible evidence for the wardrobe result. For mismatch, identify the " +
        "specific drift and the approved reference detail that should replace it."
    },
    notes: {
      type: "string",
      description: "One or two sentences: what specifically matches or drifts (e.g. 'nose/jaw read softer and " +
        "more generic than the reference, skin tone slightly lighter'), or a brief confirmation of a strong match. " +
        "If instanceCount is not 1, say so explicitly here too."
    }
  },
  required: ["score", "instanceCount", "wardrobeStatus", "wardrobeNotes", "notes"]
};

/**
 * Compares one character's canon reference image against one generated
 * shot image. Real Gemini vision call -- costs a small text-model charge
 * per check (much cheaper than a Nano Banana regeneration, which is the
 * whole point: cheap to check often, only pay to regenerate on a real
 * failure).
 */
export async function checkCanonicalLikeness(
  characterName: string,
  referenceImagePath: string,
  generatedImagePath: string
): Promise<LikenessVerdict> {
  const referenceImage = { mimeType: "image/png", data: readFileSync(referenceImagePath).toString("base64") };
  const generatedImage = { mimeType: "image/png", data: readFileSync(generatedImagePath).toString("base64") };

  const prompt =
    `You are a continuity reviewer for a Scripture video production cast entirely with Hatam/Papuan ` +
    `(Melanesian Arfak highland) actors -- a deliberate, culturally specific casting choice, not a generic or ` +
    `default appearance. The FIRST image is "${characterName}"'s approved canon reference. The SECOND image is a ` +
    `newly generated shot that is supposed to show the same "${characterName}", possibly at a different angle, ` +
    `pose, or lighting. A reference sheet may show several views of this ONE person. These views are not ` +
    `extra cast; count instances only in the SECOND image. Compare all visible garment details including ` +
    `head covering and corner attachment topology; never use an older portrait to override an approved sheet.\n\n` +
    `For the SCORE: judge ONLY whether the second image's face reads as the same specific individual -- not ` +
    `composition, not lighting, not clothing. A face that has drifted toward a generic or different regional/ ` +
    `ethnic appearance (e.g. more Mediterranean, more Western-default) than the reference is a real failure, even ` +
    `if it's a plausible-looking face on its own.\n\n` +
    `For WARDROBE STATUS: compare the named character's visible clothing DIRECTLY against the approved reference. ` +
    `This is a hard continuity check, not a historical-plausibility judgment. Check the garment cut and neckline, ` +
    `layers and mantle arrangement, the locked cream/indigo or other color-block, bands, visible tassel/fringe ` +
    `count and length, and visible footwear. If any visible element materially differs from the reference, return ` +
    `mismatch even when the clothing is historically plausible. Return not_visible only when the wardrobe cannot ` +
    `honestly be judged; never use it merely because the comparison is difficult.\n\n` +
    `For INSTANCE COUNT: this is where clothing ALSO matters -- look carefully across the WHOLE second image ` +
    `(including figures partially cropped, in the background, or facing away) for more than one figure wearing ` +
    `this character's exact locked robe/clothing color combination and hair length. A second figure sharing that ` +
    `specific combination is this character duplicated -- a real generation bug -- even if you can't clearly see ` +
    `that second figure's face, and even if the first figure's face check above scored well.`;

  const verdict = await generateJsonWithImages<LikenessVerdict>(prompt, [referenceImage, generatedImage], LIKENESS_RESPONSE_SCHEMA);
  return parseLikenessVerdict(verdict);
}

function readShotCharacterCheckRows(rows: Record<string, unknown>[]): ShotCharacterCheckRow[] {
  return rows.map((row) => {
    if (
      typeof row.shot_id !== "string" ||
      typeof row.character_name !== "string" ||
      (row.reference_path !== null && typeof row.reference_path !== "string") ||
      typeof row.generation_attempt_id !== "string" ||
      typeof row.generated_path !== "string"
    ) {
      throw new Error("Expected canonical-likeness rows with valid shot, character, reference, and generation fields.");
    }
    return {
      shot_id: row.shot_id,
      character_name: row.character_name,
      reference_path: row.reference_path,
      generation_attempt_id: row.generation_attempt_id,
      generated_path: row.generated_path
    };
  });
}

export interface CanonicalLikenessAuditResult {
  checked: number;
  passed: number;
  failed: number;
  regenerated: number;
  failures: Array<{
    shotId: string;
    characterName: string;
    score: number;
    instanceCount: number;
    wardrobeStatus: WardrobeStatus;
    wardrobeNotes: string;
    notes: string;
  }>;
}

/**
 * Audits every shot in a project that has an accepted stage-4 keyframe,
 * checking each visible character (that has a canon reference asset)
 * against that keyframe. A failure is flagged in review_notes AND the
 * underlying generation_attempts row is marked 'retry_modified' (an
 * existing GenerationResult status, exactly describing what's happening --
 * see src/providers/types.ts) so stage 4's normal reuse-if-exists check
 * treats it as needing regeneration. Pass `regenerate: true` to actually
 * call runMediaGeneration again afterward and re-check the results,
 * closing the loop from "found" to "corrected" in one call; without it,
 * this only reports what's wrong (useful for a quick audit without
 * spending on regeneration yet).
 */
export async function runCanonicalLikenessAudit(
  projectId: string,
  opts: { regenerate?: boolean } = {}
): Promise<CanonicalLikenessAuditResult> {
  const db = getDb();
  const dataDir = getDataDir();

  const rows = readShotCharacterCheckRows(db
    .prepare(
      `SELECT s.id AS shot_id, c.name AS character_name, ref.path AS reference_path,
              ga.id AS generation_attempt_id, ga.result_asset_path AS generated_path
       FROM shots s
       JOIN scenes sc ON sc.id = s.scene_id
       JOIN shot_characters shc ON shc.shot_id = s.id
       JOIN characters c ON c.id = shc.character_id
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       JOIN generation_attempts ga ON ga.shot_id = s.id AND ga.operation = 'generate' AND ga.status = 'accepted'
       LEFT JOIN (
         SELECT character_version_id, path,
                ROW_NUMBER() OVER (
                  PARTITION BY character_version_id
                  ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'turnaround' THEN 1 WHEN 'body_pose' THEN 2 ELSE 3 END
                ) AS rn
         FROM character_assets
       ) ref ON ref.character_version_id = cv.id AND ref.rn = 1
       WHERE sc.project_id = ?
       ORDER BY s.sequence`
    )
    .all(projectId));

  // Preflight the entire audit before any paid review or attempt invalidation.
  // Improved canon never becomes retroactive authority over an old film.
  for(const row of rows)assertWardrobeReviewBasis(db,row.generation_attempt_id);

  const now = Date.now();
  const invalidateAttempt = db.prepare(`UPDATE generation_attempts SET status = 'retry_modified' WHERE id = ?`);
  const insertReviewNote = db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`
  );

  let checked = 0;
  let passed = 0;
  const failures: CanonicalLikenessAuditResult["failures"] = [];

  for (const row of rows) {
    if (!row.reference_path) continue; // no canon reference asset to check against
    const referenceAbsPath = join(dataDir, "assets", row.reference_path);
    const generatedAbsPath = join(dataDir, "assets", row.generated_path);
    if (!existsSync(referenceAbsPath) || !existsSync(generatedAbsPath)) continue;

    checked++;
    const verdict = await checkCanonicalLikeness(row.character_name, referenceAbsPath, generatedAbsPath);
    if (isLikenessAligned(verdict.score, LIKENESS_THRESHOLD, verdict.instanceCount, 1, verdict.wardrobeStatus)) {
      passed++;
      continue;
    }

    failures.push({
      shotId: row.shot_id,
      characterName: row.character_name,
      score: verdict.score,
      instanceCount: verdict.instanceCount,
      wardrobeStatus: verdict.wardrobeStatus,
      wardrobeNotes: verdict.wardrobeNotes,
      notes: verdict.notes
    });
    invalidateAttempt.run(row.generation_attempt_id);
    const problem =
      verdict.wardrobeStatus === "mismatch"
        ? `has a visible wardrobe mismatch against the approved reference: ${verdict.wardrobeNotes}`
        : verdict.wardrobeStatus === "unverified"
          ? `has an unverified wardrobe comparison -- ${verdict.wardrobeNotes}`
        : verdict.instanceCount !== 1
        ? `appears ${verdict.instanceCount} time(s) in this shot instead of once (a duplicate-character rendering bug)`
        : `scored ${verdict.score}/100 (below the ${LIKENESS_THRESHOLD} threshold) against their canon reference`;
    insertReviewNote.run(
      randomUUID(),
      projectId,
      row.shot_id,
      `Canonical likeness check: ${row.character_name} ${problem} -- ${verdict.notes}`,
      now
    );
  }

  let regenerated = 0;
  if (opts.regenerate && failures.length > 0) {
    await runMediaGeneration(projectId);
    // Re-check only the shots that failed, to confirm the regeneration
    // actually fixed it rather than assuming success.
    const stillFailing: CanonicalLikenessAuditResult["failures"] = [];
    for (const failure of failures) {
      const row = findFailedShotCharacterRow(rows, failure);
      if (!row?.reference_path) continue;
      const newAttempt = db
        .prepare(
          `SELECT result_asset_path FROM generation_attempts
           WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(failure.shotId) as { result_asset_path: string } | undefined;
      if (!newAttempt) continue;
      const referenceAbsPath = join(dataDir, "assets", row.reference_path);
      const newGeneratedAbsPath = join(dataDir, "assets", newAttempt.result_asset_path);
      const recheck = await checkCanonicalLikeness(failure.characterName, referenceAbsPath, newGeneratedAbsPath);
      if (isLikenessAligned(recheck.score, LIKENESS_THRESHOLD, recheck.instanceCount, 1, recheck.wardrobeStatus)) {
        regenerated++;
      } else {
        stillFailing.push({
          shotId: failure.shotId,
          characterName: failure.characterName,
          score: recheck.score,
          instanceCount: recheck.instanceCount,
          wardrobeStatus: recheck.wardrobeStatus,
          wardrobeNotes: recheck.wardrobeNotes,
          notes: recheck.notes
        });
      }
    }
    failures.length = 0;
    failures.push(...stillFailing);
  }

  return { checked, passed, failed: failures.length, regenerated, failures };
}
