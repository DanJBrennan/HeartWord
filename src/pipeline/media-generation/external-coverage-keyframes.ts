/**
 * Codex handoff for coverage-BEAT keyframes -- a sibling to
 * external-keyframes.ts, not a modification of it. That module's whole
 * mechanism (KeyframeBrief, prepareKeyframe, importKeyframe) is
 * hard-wired to one keyframe per SHOT: getKeyframeContext() is keyed by
 * shotId, importKeyframe() writes into shots.status and a shot-scoped
 * generation_attempts row. A covered_sequence shot now legitimately needs
 * several keyframes -- one per row in coverage_beats (see
 * src/pipeline/casting/coverage-manifest.ts) -- so reusing the shot-level
 * functions here would either corrupt a shot's own single-keyframe status
 * transition or silently conflate two different beats' results under one
 * shot-level attempt. Same hash-snapshotting, same immutable-brief
 * discipline, same reference-loading approach -- just addressed by
 * coverage_beats.id instead of shots.id, and writing results into
 * coverage_beats.keyframe_asset_path/status instead of shots/generation_attempts.
 */
import { randomUUID } from "node:crypto";
import { constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { requireCurrentPlan, directionsFromRun, validateHandoffPlan } from "../creative-direction/crew-store.js";
import { parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { assetPath, readLandscapePng, sha256, keyframeSetReferences, keyframeFilmInput, keyframeFilmDirection, validateKeyframeFilm, validateReferenceFiles, prepareReferencePacket, type FilmInput, type SetReference } from "./external-keyframes.js";
import { getDataDir } from "../../db/client.js";
import { sceneReferenceAssetsForVerse } from "../../providers/story-state-assets.js";
import { sortAssetsByFreshness } from "../../characters/asset-freshness.js";

const REFERENCE_CATEGORY_RANK: Record<string, number> = { headshot: 0, body_pose: 1, turnaround: 2 };

export interface CoverageBeatContext {
  project: { id: string; language: string; book: string; chapter: number };
  shot: {
    id: string;
    scene_id: string;
    sequence: number;
    action: string;
    verse_ref: string | null;
    crowd_density: string | null;
    continuity_notes: string | null;
  };
  scene: { id: string; sequence: number; summary: string | null; lighting_continuity: string | null };
  beat: {
    id: string;
    sequence: number;
    beat_type: string;
    audio_start_ms: number;
    audio_end_ms: number;
    needs_lip_sync: number;
    notes: string | null;
    status: string;
  };
  /** The character who must be on-camera speaking, when this beat needs
   *  lip-sync -- null for a master/cutaway, which has no single mandatory
   *  subject (a cutaway's reaction subject is a creative choice Codex
   *  makes when writing the prompt, not something this context dictates). */
  speakingCharacter: { id: string; name: string } | null;
  references: Array<{
    character_id: string;
    name: string;
    version_id: string;
    version_label: string;
    category: string;
    path: string;
    sha256: string;
  }>;
  sceneReferences?: SetReference[];
}

export interface CoverageBeatBrief {
  productionRunId?: string;
  schemaVersion: 1;
  id: string;
  createdAt: number;
  context: CoverageBeatContext;
  contextHash: string;
  sources: Array<{ role: string; path: string; sha256: string; verses: Array<{ verse: number; text: string }> }>;
  prompt: string;
  promptHash: string;
  rationale: string;
  generationInputs: Array<{ path: string; sha256: string; referenceNumbers: number[] }>;
  filmInput?: FilmInput;
}

/**
 * Loads one beat's full context. Deliberately scoped to the approved Hatam
 * Mark production chapters / Papuan canon / approved-only, same guards as
 * external-keyframes.ts's getKeyframeContext -- this is the active
 * production, not a blanket approval of other books/regions.
 */
export function getCoverageBeatContext(db: DatabaseSync, dataDir: string, beatId: string): CoverageBeatContext {
  const beat = db
    .prepare(
      `SELECT id, shot_id, sequence, beat_type, audio_start_ms, audio_end_ms, needs_lip_sync, character_id, notes, status
       FROM coverage_beats WHERE id = ?`
    )
    .get(beatId) as
    | {
        id: string;
        shot_id: string;
        sequence: number;
        beat_type: string;
        audio_start_ms: number;
        audio_end_ms: number;
        needs_lip_sync: number;
        character_id: string | null;
        notes: string | null;
        status: string;
      }
    | undefined;
  if (!beat) throw new Error(`Unknown coverage beat: ${beatId}`);

  const shot = db
    .prepare(
      `SELECT id, scene_id, sequence, action, verse_ref, crowd_density, continuity_notes FROM shots WHERE id = ?`
    )
    .get(beat.shot_id) as CoverageBeatContext["shot"];
  const scene = db
    .prepare(`SELECT id, sequence, summary, lighting_continuity FROM scenes WHERE id = ?`)
    .get(shot.scene_id) as CoverageBeatContext["scene"];
  const project = db
    .prepare(
      `SELECT p.id, p.language, p.book, p.chapter FROM projects p JOIN scenes sc ON sc.project_id = p.id WHERE sc.id = ?`
    )
    .get(scene.id) as CoverageBeatContext["project"];
  if (project.language.toLowerCase() !== "hatam" || project.book.toLowerCase() !== "mark" || ![2, 3, 4].includes(project.chapter)) {
    throw new Error("The coverage-beat keyframe handoff currently supports Hatam Mark 2, Mark 3, and the producer-approved Mark 4 coverage plan only.");
  }

  let speakingCharacter: CoverageBeatContext["speakingCharacter"] = null;
  if (beat.needs_lip_sync && beat.character_id) {
    const row = db.prepare(`SELECT id, name FROM characters WHERE id = ?`).get(beat.character_id) as
      | { id: string; name: string }
      | undefined;
    if (row) speakingCharacter = row;
  }

  // The parent shot supplies the default cast. A cutaway may deliberately
  // select one approved supporting character not listed on the parent shot
  // (for example the principal scribe's reaction); `character_id` records
  // that choice and includes its reference without mutating shot casting.
  const cast = db
    .prepare(
      `SELECT c.id, c.name, c.region, c.canon_status FROM shot_characters sh
       JOIN characters c ON c.id = sh.character_id WHERE sh.shot_id = ?
       UNION
       SELECT c.id, c.name, c.region, c.canon_status FROM characters c WHERE c.id = ?
       ORDER BY id`
    )
    .all(shot.id, beat.character_id ?? "") as Array<{ id: string; name: string; region: string; canon_status: string }>;

  const references: CoverageBeatContext["references"] = [];
  for (const character of cast) {
    if (character.region !== "Papuan") throw new Error(`Wrong regional canon: ${character.name}`);
    if (character.canon_status !== "approved") throw new Error(`Character is not approved: ${character.name}`);
    const versions = db
      .prepare(`SELECT id, version_label FROM character_versions WHERE character_id = ? AND status = 'approved'`)
      .all(character.id) as Array<{ id: string; version_label: string }>;
    if (versions.length !== 1) throw new Error(`Need exactly one approved version: ${character.name}`);
    const version = versions[0]!;
    const rawAssets = db
      .prepare(
        `SELECT category, path, content_hash, imported_from AS importedFrom,
         story_state, available_from_verse, available_through_verse, asset_role FROM character_assets WHERE character_version_id = ?
         AND category IN ('headshot','body_pose','turnaround','approved_source')`
      )
      .all(version.id) as Array<{ category: string; path: string; content_hash: string | null; importedFrom: string | null }>;
    // See asset-freshness.ts: prefers an asset a promotion didn't leave
    // carried-forward, so a same-category sibling that was never
    // regenerated can't silently outrank the one that was.
    const assets = sortAssetsByFreshness(sceneReferenceAssetsForVerse(rawAssets,shot.verse_ref ?? undefined), REFERENCE_CATEGORY_RANK);
    const isSpeaker = speakingCharacter?.id === character.id;
    const chosen = (
      isSpeaker && assets.some((a) => a.category === "headshot")
        ? [assets.find((a) => a.category === "headshot"), assets.find((a) => a.category === "body_pose")]
        : [assets.find((a) => a.category === "body_pose") ?? assets[0]]
    ).filter((a) => a !== undefined);
    if (!chosen.length) throw new Error(`Missing approved reference assets: ${character.name}`);
    for (const asset of chosen) {
      const hash = sha256(readFileSync(assetPath(dataDir, asset.path)));
      if (asset.content_hash && asset.content_hash.toLowerCase() !== hash) {
        throw new Error(`Reference hash mismatch: ${asset.path}`);
      }
      references.push({
        character_id: character.id,
        name: character.name,
        version_id: version.id,
        version_label: version.version_label,
        category: asset.category,
        path: asset.path,
        sha256: hash
      });
    }
  }

  return {
    project,
    shot,
    scene,
    beat: {
      id: beat.id,
      sequence: beat.sequence,
      beat_type: beat.beat_type,
      audio_start_ms: beat.audio_start_ms,
      audio_end_ms: beat.audio_end_ms,
      needs_lip_sync: beat.needs_lip_sync,
      notes: beat.notes,
      status: beat.status
    },
    speakingCharacter,
    references,
    ...(() => { const sceneReferences = keyframeSetReferences(db,dataDir,shot.id); return sceneReferences.length ? {sceneReferences} : {}; })()
  };
}

/**
 * Snapshots one beat's context plus a prompt/rationale Codex has already
 * written (same division of labor as prepareKeyframe: Codex inspects the
 * context and source verses, writes the prompt itself -- this function
 * only validates and hashes it, never generates prompt text). A generated
 * (but not accepted) beat can be prepared again when the producer requests
 * a new candidate; the prior image and provenance remain immutable.
 */
export function prepareCoverageBeatBrief(
  db: DatabaseSync,
  dataDir: string,
  beatId: string,
  prompt: string,
  rationale: string
): CoverageBeatBrief {
  if (!prompt.trim() || !rationale.trim()) throw new Error("Prompt and production rationale are required.");
  if (!/16\s*:\s*9/.test(prompt)) throw new Error("Explicit 16:9 framing is required.");
  const context = getCoverageBeatContext(db, dataDir, beatId);
  const plan = requireCurrentPlan(db,dataDir,context.project.id);
  prompt += directionsFromRun(plan, context.shot.id, beatId);
  const filmInput = keyframeFilmInput(plan,context.shot.id);
  prompt += keyframeFilmDirection(filmInput);
  if (context.beat.status !== "planned" && context.beat.status !== "generated") {
    throw new Error(`Beat ${beatId} is already '${context.beat.status}' -- only a planned or unaccepted generated beat can be prepared.`);
  }

  const chapterSlug = `${context.project.book.toLowerCase()}-${context.project.chapter}`;
  const sources = (context.project.chapter === 4
    ? [
        { role: "verified Hatam source", path: "source/hatam/text/Mark/Mark 4.docx" },
        { role: "English reference", path: "source/english-esv/text/Mark/Mark 4.docx" }
      ]
    : [
        { role: "verified Hatam source", path: `source/hatam/${chapterSlug}/${chapterSlug}-text.docx` },
        { role: "English reference", path: `reference/english/${chapterSlug}/${chapterSlug}-text.docx` }
      ]).map((source) => {
    const path = assetPath(dataDir, source.path);
    return { ...source, sha256: sha256(readFileSync(path)), verses: parseSourceTextByVerse(path) };
  });

  const id = randomUUID();
  const packet = prepareReferencePacket(dataDir,id,context.references,context.sceneReferences);
  prompt += packet.direction;
  if (context.beat.needs_lip_sync) prompt += "\nPrefer the speaking character's approved headshot likeness in a scene-context head-and-shoulders image with visible mouth; Jesus facing or near the camera is preferred, with reasonable alternate angles/distances permitted by the accepted shot.\n";

  return {
    schemaVersion: 1,
    productionRunId: plan.id,
    id,
    createdAt: Date.now(),
    context,
    contextHash: sha256(JSON.stringify(context)),
    sources,
    prompt,
    promptHash: sha256(prompt),
    rationale,
    generationInputs:packet.inputs,
    ...(filmInput ? {filmInput} : {})
  };
}

/**
 * Imports a generated candidate for one beat -- writes into
 * coverage_beats (keyframe_asset_path, status='generated'), NEVER into
 * shots or shot-scoped generation_attempts, so a shot's own keyframe
 * status/history stays exactly what external-keyframes.ts already tracks
 * for it. Idempotent on the same brief id, same integrity checks as
 * importKeyframe (brief unchanged since prepare, sources unchanged,
 * references unchanged, output is genuinely 16:9).
 */
export function importCoverageBeatKeyframe(
  db: DatabaseSync,
  dataDir: string,
  brief: CoverageBeatBrief,
  imagePath: string,
  review: string
): { beatId: string; imagePath: string; provenancePath: string } {
  if (brief.schemaVersion !== 1 || !review.trim()) throw new Error("A v1 brief and visual review are required.");
  if (sha256(brief.prompt) !== brief.promptHash || sha256(JSON.stringify(brief.context)) !== brief.contextHash) {
    throw new Error("Brief changed after preparation. Prepare a new brief.");
  }
  const current = getCoverageBeatContext(db, dataDir, brief.context.beat.id);
  validateHandoffPlan(db, dataDir, current.project.id, brief.productionRunId);
  validateKeyframeFilm(requireCurrentPlan(db,dataDir,current.project.id),current.shot.id,brief.filmInput);
  if (sha256(JSON.stringify(current)) !== brief.contextHash) {
    throw new Error("Beat/shot/canon changed after preparation. Prepare a new brief.");
  }
  for (const source of brief.sources) {
    if (sha256(readFileSync(assetPath(dataDir, source.path))) !== source.sha256) {
      throw new Error("Scripture source changed after preparation.");
    }
  }
  for (const input of brief.generationInputs) {
    if (sha256(readFileSync(assetPath(dataDir, input.path))) !== input.sha256) {
      throw new Error("Generation input changed after preparation.");
    }
  }

  const bytes = readFileSync(imagePath);
  const dimensions = readLandscapePng(bytes);
  const resultHash = sha256(bytes);

  const existingAttempt = db.prepare(`SELECT result_asset_path FROM coverage_keyframe_attempts WHERE id = ?`).get(brief.id) as
    | { result_asset_path: string }
    | undefined;
  if (existingAttempt) {
    const saved = assetPath(dataDir, existingAttempt.result_asset_path);
    if (sha256(readFileSync(saved)) !== resultHash) {
      throw new Error("This brief already has a different image; prepare a new brief for each generation.");
    }
    return { beatId: brief.context.beat.id, imagePath: saved, provenancePath: saved.replace(/\.png$/, ".json") };
  }

  const resultPath = `generated/keyframes/codex-coverage/${current.shot.id}/${brief.context.beat.id}-${brief.id}.png`;
  const saved = assetPath(dataDir, resultPath);
  const provenancePath = saved.replace(/\.png$/, ".json");
  mkdirSync(dirname(saved), { recursive: true });
  copyFileSync(imagePath, saved, constants.COPYFILE_EXCL);
  const billing =
    "Built-in Codex image tool: underlying model and per-call billing not reported. cost_usd=0 is a schema " +
    "compatibility placeholder, not a claim of free generation. No cost ledger entry was invented.";
  writeFileSync(
    provenancePath,
    JSON.stringify(
      { ...brief, provider: "codex_imagegen", model: "not_reported", resultPath, resultHash, dimensions, billing, review, status: "hold_for_review" },
      null,
      2
    ),
    { flag: "wx" }
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db.prepare(`SELECT keyframe_asset_path FROM coverage_beats WHERE id = ?`).get(current.beat.id) as
      | { keyframe_asset_path: string | null }
      | undefined;
    if (previous?.keyframe_asset_path) {
      db.prepare(`UPDATE coverage_keyframe_attempts SET status='retry_modified'
        WHERE coverage_beat_id=? AND result_asset_path=? AND status='hold_for_review'`)
        .run(current.beat.id, previous.keyframe_asset_path);
      db.prepare(`UPDATE review_notes SET resolved=1 WHERE subject_type='shot' AND subject_id=? AND source='qc' AND note LIKE ?`)
        .run(current.shot.id, `%${previous.keyframe_asset_path.replace(/\.png$/, ".json")}%`);
      db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
        VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`).run(
          randomUUID(), current.project.id, current.shot.id,
          `Producer requested regeneration of coverage beat ${current.beat.id}; prior candidate retained at ${previous.keyframe_asset_path}.`,
          Date.now()
        );
    }
    db.prepare(`INSERT INTO coverage_keyframe_attempts
      (id, coverage_beat_id, provider, model, prompt, status, result_asset_path, created_at)
      VALUES (?, ?, 'codex_imagegen', 'not_reported', ?, 'hold_for_review', ?, ?)`).run(
        brief.id, current.beat.id, brief.prompt, resultPath, Date.now()
      );
    db.prepare(`UPDATE coverage_beats SET keyframe_asset_path = ?, status = 'generated' WHERE id = ?`).run(
      resultPath,
      brief.context.beat.id
    );
    db.prepare(
      `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
       VALUES (?, ?, 'shot', ?, 'qc', ?, 0, ?)`
    ).run(
      randomUUID(),
      current.project.id,
      current.shot.id,
      `Codex coverage-beat keyframe candidate ${brief.id} (beat ${current.beat.sequence}, ${current.beat.beat_type})\n` +
        `${review}\n\n${billing}\nProvenance: ${provenancePath}\nPending producer review; no video generated.`,
      Date.now()
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { beatId: current.beat.id, imagePath: saved, provenancePath };
}

/** Moves a beat from 'generated' to 'accepted' -- ready for stage 4/5 to
 *  turn into a Veo/Omni video clip (master/cutaway) or a Kling lip-sync
 *  input (lip_sync_insert). Mirrors acceptKeyframe's shot-level meaning
 *  at beat granularity. */
export function acceptCoverageBeatKeyframe(db: DatabaseSync, beatId: string, dataDir=getDataDir()): { beatId: string; shotId: string } {
  const beat = db.prepare(`SELECT id, shot_id, status, keyframe_asset_path FROM coverage_beats WHERE id = ?`).get(beatId) as
    | { id: string; shot_id: string; status: string; keyframe_asset_path: string | null }
    | undefined;
  if (!beat) throw new Error(`Unknown coverage beat: ${beatId}`);
  if (beat.status !== "generated" || !beat.keyframe_asset_path) {
    throw new Error(`Beat ${beatId} has no generated keyframe awaiting approval (status: ${beat.status}).`);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const image=assetPath(dataDir,beat.keyframe_asset_path);
    const saved=JSON.parse(readFileSync(image.replace(/\.png$/,".json"),"utf8")) as CoverageBeatBrief & {resultHash:string};
    validateReferenceFiles(dataDir,saved);
    const current=getCoverageBeatContext(db,dataDir,beatId);
    // Planned -> generated is this candidate's lifecycle, not a creative edit.
    const comparison={...current,beat:{...current.beat,status:saved.context.beat.status}};
    if(saved.context.beat.id!==beatId || sha256(JSON.stringify(comparison))!==saved.contextHash || sha256(readFileSync(image))!==saved.resultHash)throw new Error("Coverage candidate/reference context changed before acceptance.");
    validateHandoffPlan(db,dataDir,current.project.id,saved.productionRunId);
    validateKeyframeFilm(requireCurrentPlan(db,dataDir,current.project.id),current.shot.id,saved.filmInput);
    db.prepare(`UPDATE coverage_beats SET status = 'accepted' WHERE id = ?`).run(beat.id);
    db.prepare(`UPDATE coverage_keyframe_attempts SET status='accepted'
      WHERE coverage_beat_id=? AND result_asset_path=?`).run(beat.id, beat.keyframe_asset_path);
    db.prepare(
      `UPDATE review_notes SET resolved = 1 WHERE subject_type = 'shot' AND subject_id = ?
       AND source = 'qc' AND note LIKE ?`
    ).run(beat.shot_id, `%beat%${beatId}%`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { beatId: beat.id, shotId: beat.shot_id };
}

/** One row per beat still needing a keyframe, across the whole project --
 *  the export list Codex works through, one prepare/generate/import per
 *  row, same rhythm as keyframes.ts's shot-level "status" command. */
export function coverageBeatsNeedingKeyframes(db: DatabaseSync, projectId: string): unknown[] {
  return db
    .prepare(
      `SELECT sc.sequence AS scene, s.sequence AS shot, s.id AS shot_id, s.verse_ref,
              cb.id AS beat_id, cb.sequence AS beat_sequence, cb.beat_type, cb.needs_lip_sync,
              cb.audio_start_ms, cb.audio_end_ms, cb.notes, cb.status
       FROM coverage_beats cb
       JOIN shots s ON s.id = cb.shot_id
       JOIN scenes sc ON sc.id = s.scene_id
       WHERE sc.project_id = ? AND cb.requires_new_keyframe = 1 AND cb.keyframe_asset_path IS NULL
       ORDER BY sc.sequence, s.sequence, cb.sequence`
    )
    .all(projectId);
}
