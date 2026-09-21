import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { GeminiImageProvider } from "../../providers/gemini/index.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../../providers/gemini/index.js";
import { KlingVideoProvider } from "../../providers/kling/index.js";
import type { CharacterRef } from "../../providers/types.js";
import type { ProjectRow } from "../ingestion/index.js";
import { loadSuggestedFix, runShotReview, type SuggestedFix } from "../qc/director.js";
import { matchesBeatScope, tagNote } from "../qc/beat-scope.js";
import { requireCurrentPlan, directionsFromRun } from "../creative-direction/crew-store.js";
import type { StageResult } from "../types.js";
import { generateNonSpeakingVideoCandidate } from "./final-video.js";
import { generateShotDraft } from "./draft-room.js";
import { shotRiskFor } from "./shot-risk-lookup.js";

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
  verse_ref: string | null;
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
    "shoulder, including in doorways and openings, with NO empty floor space and NO open aisle, path, or gap " +
    "anywhere in the crowd (a wide-open floor in the middle of an otherwise packed room is still a failure, even " +
    "if the edges are full). Do NOT arrange the crowd as neat, orderly rows or a lineup along the walls -- real " +
    "packed crowds cluster irregularly, at uneven depths, facing different directions, some partly obscured " +
    "behind others. If the action describes 'no room' or an overflowing crowd, render that literally -- a " +
    "modestly-sized or neatly-arranged gathering is a failure here, not a reasonable interpretation."
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
 *
 * Extended 2026-09-08 after a full re-review of the Mark 2 project (post
 * canon-garment-fix) found the SAME handful of setting/staging errors
 * repeating across most flagged shots, independent of which characters
 * were in frame -- architecture, missing continuity debris, and
 * "already-finished" staging aren't costume problems and weren't touched
 * by that work. Folded the Critic's own recurring findings in directly:
 * - ARCHITECTURE: was rendering as light tan adobe/Pueblo-style (visible
 *   projecting log-end vigas) -- 1st-century Capernaum was built from
 *   dark, rough basalt fieldstone with flat mud/timber roofs, not
 *   pitched gables, tiled/pantile roofing, glass windows, paneled doors,
 *   or modern infrastructure.
 * - PROPS: Nano Banana's own generic "ancient" prior kept reaching for
 *   Bronze-Age clay tablets or medieval-style bound codices -- 1st-
 *   century written records were papyrus/parchment scrolls or wax
 *   tablets.
 * - GEOGRAPHY: the Sea of Galilee is an inland freshwater lake ringed by
 *   hills, not an ocean coastline with cliffs.
 * - CONTINUITY DEBRIS: a shot whose action/continuity notes describe
 *   recent physical disruption (digging through a roof, breaking
 *   something) kept rendering a suspiciously clean environment.
 * - MOTION FEASIBILITY: keyframes kept landing on the END state of the
 *   described action (already standing, already turned, already
 *   speaking) rather than a workable starting point for the video
 *   generator to animate into that action.
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
  "are Papuan; the world around them is first-century Judea, exactly as it would be for any other casting.\n\n" +
  "ARCHITECTURE: buildings are constructed from rough, unhewn DARK BASALT FIELDSTONE bound with mud mortar -- " +
  "not light tan adobe, smooth plaster, or sandstone. Roofs are FLAT (timber beams topped with reeds/branches and " +
  "packed mud/clay), never pitched, gabled, or covered in fired ceramic tiles. Do not show projecting rounded " +
  "log-ends (vigas) on exterior walls, glass windows, modern paneled doors with metal hardware, tiled or polished " +
  "floors, minarets, or any modern rooftop fixtures (tanks, pipes, wiring). If the location is by the water, it " +
  "is the Sea of Galilee -- an inland freshwater lake surrounded by rolling hills, never an ocean coastline or " +
  "sea cliffs.\n\n" +
  "PROPS: written records are papyrus/parchment SCROLLS or wooden WAX TABLETS with a stylus -- never a bound " +
  "book/codex (a later invention) and never a Bronze-Age clay tablet.\n\n" +
  "CONTINUITY DEBRIS: if the shot's action or continuity notes describe something recently broken, dug through, " +
  "or physically disrupted (e.g. a roof dug open), the visible aftermath (fallen dirt, broken thatch/branches, " +
  "dust, debris on the floor or on nearby people) MUST be present -- a pristine, undisturbed scene right after " +
  "such an action is wrong.\n\n" +
  "MOTION FEASIBILITY: this keyframe is the STARTING FRAME for a video clip that will animate the action " +
  "described below, not a still capturing its completion. Show the action beginning or mid-progress -- a hand " +
  "starting to reach, a body starting to turn, feet mid-stride -- with clear physical room left for that motion " +
  "to continue. A pose already frozen at the action's end state (already standing, already turned, already " +
  "speaking with the gesture fully extended) gives a video generator nothing to animate and is a failure.";

function buildShotPrompt(scene: SceneRow, shot: ShotRow, characterNames: string[], suggestedFix: SuggestedFix | null = null): string {
  const framing = shot.framing ? (FRAMING_DESCRIPTIONS[shot.framing] ?? shot.framing) : "medium shot";
  const crowdInstruction = shot.crowd_density
    ? (CROWD_DENSITY_INSTRUCTIONS[shot.crowd_density] ?? CROWD_DENSITY_INSTRUCTIONS.moderate)
    : CROWD_DENSITY_INSTRUCTIONS.moderate;

  // Closes the QC feedback loop (see qc/director.ts's loadSuggestedFix):
  // a shot regenerated because its prior attempt was flagged gets the
  // Critic's own smallest-fix instruction folded directly into THIS
  // prompt, instead of blindly resubmitting the exact prompt that just
  // failed. Placed right after the shared casting/setting anchor -- high
  // enough to not get diluted by the rest of the shot-specific detail
  // below, matching how CASTING_AND_SETTING_ANCHOR's own hard rules are
  // stated first and forcefully.
  const correctionBlock = suggestedFix
    ? `\n\nCORRECTION FROM PRIOR REVIEW (this is a regeneration -- the previous attempt at this shot was flagged): ` +
      `${suggestedFix.fix} Everything else about the prior composition that already worked should stay as it was, ` +
      `specifically: ${suggestedFix.preserve}.` +
      (suggestedFix.criticFindings.length
        ? `\n\nPER-FINDING REVIEW CONTEXT (uncalibrated advisory evidence only; do not treat confidence as a vote, authority, or permission to waive any source, canon, cost, or human-review constraint):\n` +
          suggestedFix.criticFindings.map((finding) =>
            `- ${finding.severity}: ${finding.finding}. Evidence: ${finding.evidence}. Confidence: ${finding.confidence}/100 (uncalibrated). Limitations: ${finding.limitations}. Requested action: ${finding.requestedAction}`
          ).join("\n")
        : `\n\nPER-FINDING REVIEW CONTEXT: confidence not reported in this legacy review; investigate the recorded evidence without inventing a score.`)
    : "";

  return `${CASTING_AND_SETTING_ANCHOR}${correctionBlock}

Scene setting: ${scene.lighting_continuity ?? "natural daylight, consistent with the rest of the scene"}.

Shot: ${framing}, camera ${shot.camera_movement ?? "static"}.
Action: ${shot.action}

Population/crowd: ${crowdInstruction}
${shot.continuity_notes ? `\nIMPORTANT continuity constraint for this exact shot: ${shot.continuity_notes}\n` : ""}
Characters visible in this shot (use the attached reference image(s) for exact likeness -- same face, build, and clothing as shown; do not redesign them): ${
    characterNames.length > 0 ? characterNames.join(", ") : "none named -- establishing/background shot"
  }.
${
  characterNames.length > 0
    ? `\nCHARACTER IDENTITY RULES: each named character above must appear EXACTLY ONCE in this frame -- never as two ` +
      `separate figures, even partially visible or in a doorway/background. Every unnamed background extra must ` +
      `have a DIFFERENT face and a DIFFERENT clothing color/pattern combination from every named character listed ` +
      `above -- never let an extra's outfit or face accidentally match a named character's locked design.\n`
    : ""
}
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
const generateKeyframes = async (projectId: string, onlyShotIds?: string[]): Promise<StageResult> => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;
  if (!project) {
    return { ok: false, reasoning: `Media generation failed: no project with id ${projectId}.` };
  }

  // Older imported projects and the narrow SQLite fixtures used for the
  // media-stage integration test predate shot verse binding. Keep those
  // projects runnable (without state-specific references) while current
  // projects provide the verse needed for story-state selection.
  const hasShotVerseRef = (db.prepare("PRAGMA table_info(shots)").all() as Array<{ name: string }>)
    .some((column) => column.name === "verse_ref");
  const shotVerseSelect = hasShotVerseRef ? "s.verse_ref" : "NULL AS verse_ref";
  const shots = db
    .prepare(
      `SELECT s.id, s.scene_id, s.sequence, s.action, s.framing, s.camera_movement, s.needs_lip_sync,
              s.crowd_density, s.continuity_notes, ${shotVerseSelect}
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
  // Codex's review of this pipeline (2026-09-11, two passes) caught two
  // related bugs in what used to be a separate "is there an accepted row
  // to reuse" query run before checking anything else: (a) that query
  // matches the newest row WITH status='accepted', not the shot's actual
  // latest attempt -- if a NEWER attempt exists in a hold/escalate state
  // while an OLDER one is still 'accepted', the older file kept getting
  // reused forever and the newer hold was never even inspected; (b) a
  // shot whose latest attempt was hold_for_review/escalate still got
  // regenerated anyway, since nothing checked attempt status before
  // spending (reproduced: a 4th generation attempt after 3 had already
  // resulted in a hold). Fixed by querying the shot's single latest
  // attempt FIRST and deciding reuse/hold/retry/regenerate from that one
  // row, rather than two independent, inconsistent queries.
  const findLatestAttempt = db.prepare(
    `SELECT id, status, result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' ORDER BY created_at DESC LIMIT 1`
  );
  // Every unresolved 'qc' note for this shot, not just the newest -- a
  // covered_sequence shot's coverage-beat reviews (runCoverageBeatCandidateReview)
  // write their OWN 'qc' notes under this same shot_id, and a newer one of
  // those must not mask an older single-clip "review status: incomplete"
  // marker for a COMPLETELY different attempt. Matched by attempt id (via
  // matchesBeatScope's ATTEMPT tag), not by recency, so this is scoped
  // correctly regardless of what else has been reviewed on this shot.
  const findUnresolvedNotes = db.prepare(
    `SELECT note FROM review_notes WHERE subject_type = 'shot' AND subject_id = ? AND source = 'qc' AND resolved = 0`
  );
  const insertReviewNote = db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`
  );
  const downgradeAttemptStatus = db.prepare(`UPDATE generation_attempts SET status = 'hold_for_review' WHERE id = ?`);

  let generated = 0;
  let reused = 0;
  let failed = 0;
  let heldForReview = 0;
  let reviewFailed = 0;
  let awaitingHuman = 0;
  const failures: string[] = [];
  const heldShots: string[] = [];
  const awaitingHumanShots: string[] = [];

  for (const shot of shots) {
    if (onlyShotIds && !onlyShotIds.includes(shot.id)) continue;
    const scene = sceneById.get(shot.scene_id) ?? { id: shot.scene_id, sequence: 0, lighting_continuity: null };

    const latest = findLatestAttempt.get(shot.id) as { id: string; status: string; result_asset_path: string | null } | undefined;

    if (latest?.status === "accepted" && latest.result_asset_path && existsSync(join(dataDir, "assets", latest.result_asset_path))) {
      reused++;
      continue;
    }

    if (latest && (latest.status === "hold_for_review" || latest.status === "escalate")) {
      const notes = findUnresolvedNotes.all(shot.id) as Array<{ note: string }>;
      const reviewIncomplete = notes.some(
        (n) => matchesBeatScope(n.note, { attemptId: latest.id }) && n.note.includes("REVIEW STATUS: incomplete")
      );
      if (!reviewIncomplete) {
        // A real content-based hold/escalate -- a human needs to look,
        // spending on another generation attempt would not resolve it.
        awaitingHuman++;
        awaitingHumanShots.push(`scene ${scene.sequence} shot ${shot.sequence} (${latest.status})`);
        continue;
      }
      // The review infrastructure failed, not the image -- retry the
      // review against the EXISTING file rather than spending on a new
      // generation attempt. runShotReview's own lookup no longer requires
      // an 'accepted' status, so it can re-review this attempt directly,
      // and now always persists its verdict (including back to
      // 'accepted') and resolves this note, so a successful retry
      // actually finishes instead of looping.
      try {
        const review = await runShotReview(shot.id);
        if (review.decision.status !== "accepted") {
          heldForReview++;
          heldShots.push(`scene ${scene.sequence} shot ${shot.sequence} (${review.decision.status})`);
        }
      } catch {
        // Still incomplete -- leave it held for the next run to retry
        // again, rather than spending on a new generation attempt.
        reviewFailed++;
      }
      continue;
    }
    const shotCharacters = charStmt.all(shot.id) as unknown as ShotCharacterRow[];
    const characterRefs: CharacterRef[] = shotCharacters.map((c) => ({
      characterId: c.character_id,
      characterVersionId: c.character_version_id,
      storyVerseRef: shot.verse_ref ?? undefined
    }));

    let prompt: string;
    try {
      const plan = requireCurrentPlan(db, dataDir, projectId);
      prompt = buildShotPrompt(scene, shot, shotCharacters.map((c) => c.name), loadSuggestedFix(db, shot.id)) + directionsFromRun(plan, shot.id);
    } catch (error) {
      return { ok: false, reasoning: `New media is held: ${(error as Error).message}` };
    }
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
        // A review that throws (network error, unparseable response, etc.)
        // must never leave this attempt's status silently 'accepted' --
        // the reuse-if-exists check above only trusts an 'accepted' row,
        // so an image that never actually finished QC would otherwise be
        // reused forever as if it had passed. Retry once (transient
        // failures are the common case), and if it still fails, downgrade
        // the attempt to 'hold_for_review' so it surfaces for a human
        // instead of silently passing as reviewed.
        let review;
        let reviewError: Error | undefined;
        for (let attempt = 0; attempt < 2 && !review; attempt++) {
          try {
            review = await runShotReview(shot.id);
          } catch (err) {
            reviewError = err as Error;
          }
        }

        if (review) {
          if (review.decision.status !== "accepted") {
            heldForReview++;
            heldShots.push(`scene ${scene.sequence} shot ${shot.sequence} (${review.decision.status})`);
          }
        } else {
          reviewFailed++;
          downgradeAttemptStatus.run(attemptId);
          insertReviewNote.run(
            randomUUID(),
            project.id,
            shot.id,
            // "REVIEW STATUS: incomplete" (checked above, at the top of
            // this loop) distinguishes this from a real content-based
            // hold_for_review verdict -- both land on the same status
            // column value, but only this one should ever be retried
            // automatically against the existing image; a real content
            // hold must wait for a human, full stop. Tagged with THIS
            // exact attempt's id (not just this shot) so a coverage-beat
            // review's own newer, unrelated note can never mask it.
            tagNote(
              { attemptId },
              `REVIEW STATUS: incomplete\nAutomated QC review could not run for this shot after 2 attempts: ${reviewError?.message}. ` +
                `Attempt held for review rather than left as accepted, so it won't be silently reused unreviewed.`
            ),
            Date.now()
          );
        }
      }
    } catch (err) {
      failed++;
      const message = (err as Error).message;
      failures.push(`scene ${scene.sequence} shot ${shot.sequence}: ${message}`);
      // The provider boundary may have accepted a request before its response
      // was lost. Retain the exact submitted prompt as an uncertain candidate
      // and require reconciliation instead of blindly submitting again.
      const attemptId = randomUUID(), now = Date.now();
      insertAttempt.run(attemptId, shot.id, tier === "pro" ? "nano_banana_pro" : "nano_banana", "submission_uncertain", prompt, "hold_for_review", null, 0, now);
      insertCostEntry.run(randomUUID(), project.id, attemptId, 0, now);
      insertReviewNote.run(randomUUID(), project.id, shot.id, `Media generation failed for this shot: ${message}`, Date.now());
    }
  }

  return {
    ok: failed === 0 && heldForReview === 0 && reviewFailed === 0 && awaitingHuman === 0,
    reasoning:
      `Media generation for ${project.book} ${project.chapter}: ${generated} keyframe(s) generated via Nano Banana` +
      `${failed > 0 || generated > 0 ? "/Pro (tiered by needs_lip_sync)" : ""}, ${reused} reused from a prior run` +
      (failed > 0 ? `, ${failed} failed (flagged in review_notes): ${failures.join(" | ")}` : "") +
      `. Each newly generated keyframe was automatically reviewed by the Critic/Director QC pass: ` +
      `${heldForReview} flagged for regeneration or human review` +
      (heldShots.length > 0 ? ` (${heldShots.join(" | ")})` : "") +
      (reviewFailed > 0 ? `, ${reviewFailed} review(s) could not run (flagged in review_notes)` : "") +
      (awaitingHuman > 0
        ? `, ${awaitingHuman} shot(s) already held for a real content concern or escalated -- skipped rather than ` +
          `spending on another generation attempt, awaiting a human decision` +
          (awaitingHumanShots.length > 0 ? ` (${awaitingHumanShots.join(" | ")})` : "")
        : "") +
      ". A retry_modified shot will be regenerated automatically the next time this stage runs; a " +
      "hold_for_review/escalate shot will not, until a human resolves it." +
      " This stage produces still images. The existing video and lip-sync tools turn accepted keyframes into footage before Picture Editor assembly."
  };
};

const activeGeneration = new Set<string>();
export const runMediaGeneration = async (projectId: string, onlyShotIds?: string[]): Promise<StageResult> => {
  if (activeGeneration.has(projectId)) return { ok: false, reasoning: "Keyframe generation is already running for this chapter." };
  activeGeneration.add(projectId);
  try {
    const keyframes=await generateKeyframes(projectId, onlyShotIds);
    if (!keyframes.ok) return keyframes;
    const db=getDb();
    const shots=db.prepare(`SELECT sh.id FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? AND sh.needs_lip_sync=0`).all(projectId) as Array<{id:string}>;
    const outcomes=[] as string[];
    for (const shot of shots) {
      if (onlyShotIds && !onlyShotIds.includes(shot.id)) continue;
      // A risky shot spends ~$0.26 on a 360p draft to be judged before it
      // spends up to $1.60 committing a render -- the draft-then-commit
      // rule in docs/design/media-generation.md. Only once a draft has
      // been chosen (or the shot was never risky) does the full render
      // run.
      if (shotRiskFor(db,shot.id).draftFirst) {
        const draft=await generateShotDraft(db,projectId,shot.id,new GeminiDraftVideoProvider());
        if (draft.status!=="chosen"&&draft.status!=="settled") { outcomes.push(draft.status); continue; }
      }
      const out=await generateNonSpeakingVideoCandidate(db,projectId,shot.id,{veo:new GeminiVideoProvider(),kling:new KlingVideoProvider(),draft:new GeminiDraftVideoProvider()});
      outcomes.push(out.status);
    }
    const drafts=outcomes.filter(s=>s==="draft").length;
    const atCapacity=outcomes.filter(s=>s==="at_capacity").length;
    const waiting=outcomes.filter(s=>s==="candidate"||s==="held").length;
    const pending=[
      drafts?`${drafts} draft(s) await a producer's choice before any full render`:"",
      atCapacity?`${atCapacity} shot(s) hold the maximum drafts already`:"",
      waiting?`${waiting} non-speaking final-video candidate(s) await producer review/reconciliation; no clip was auto-selected`:""
    ].filter(Boolean).join("; ");
    return pending ? {ok:false,reasoning:`${keyframes.reasoning} ${pending}.`} : keyframes;
  }
  finally { activeGeneration.delete(projectId); }
};
