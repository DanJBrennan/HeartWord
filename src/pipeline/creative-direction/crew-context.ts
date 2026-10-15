import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { parseNarratedParagraphTitles, parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { discoverSourcePaths } from "../ingestion/source-catalog.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import type { CrewBrief, CrewPhase, CrewShot, CrewResult } from "./crew-types.js";
import { readCutTimingAudit } from "../assembly/cut-timing-audit.js";
import { readConfirmedSpeechRuns, speechRunPauseIsSafe } from "../ingestion/continuous-speech.js";
import { speechRunBinding } from "../voice-lipsync/speech-run-audio.js";

export const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export function productionAssetPath(dataDir: string, path: string): string {
  const root = resolve(dataDir, "assets");
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel)) throw new Error("Asset must be inside HeartWord's assets directory.");
  return absolute;
}
export function loadCrewBrief(db: DatabaseSync, dataDir: string, projectId: string, phase: CrewPhase): CrewBrief {
  const project = db.prepare("SELECT id, language, book, chapter FROM projects WHERE id = ?").get(projectId) as CrewBrief["project"] | undefined;
  if (!project) throw new Error("Project not found.");
  if (project.language.toLowerCase() !== "hatam") throw new Error("Configure and approve a regional production canon before planning another language.");
  // The current production-corpus decision has one explicit language-to-canon
  // authority. Lesson matching below uses the actual selected canon region,
  // rather than treating this policy value as a universal regional default.
  const approvedRegion = project.language.toLowerCase() === "hatam" ? "Papuan" : null;
  // Catalog-aware (falls back to the legacy per-chapter layout automatically)
  // and respects this function's own injected dataDir, unlike calling
  // discoverSourcePaths with its default (the real HEARTWORD_DATA_DIR) would
  // -- see docs/plans/CURRENT_GOAL.md, 2026-09-19. requireAudio=false: this
  // brief never aligned against or verified a chapter audio file -- it reads
  // audio per-segment from audio_segments.source_path below instead -- so an
  // absent FCBH audio file must not block text/reference resolution.
  const textPaths = discoverSourcePaths(project, undefined, dataDir, false);
  const sources = [textPaths.docxPath, textPaths.referencePath];
  const source: CrewBrief["source"] = { text: parseSourceTextByVerse(sources[0]!), reference: parseSourceTextByVerse(sources[1]!), hashes: sources.map(p => digest(readFileSync(p))) };
  if (!source.text.length || !source.reference.length) throw new Error("Both source and reference Scripture text are required.");
  const normalizeBook = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const checkRef = (value: string | null) => {
    const match = value?.match(/^(.+?)\s+(\d+):\d+/);
    if (!match || normalizeBook(match[1]!) !== normalizeBook(project.book) || Number(match[2]) !== project.chapter) throw new Error("A verse reference belongs to another book or chapter.");
  };
  const sourceVerses = source.text.map(v => v.verse).join(",");
  if (sourceVerses !== source.reference.map(v => v.verse).join(",")) throw new Error("Source and reference verse coverage differ; review source material first.");
  const alignedAudio = db.prepare(`SELECT id, start_ms AS startMs, end_ms AS endMs, verse_ref AS verseRef,
    speaker_character_id AS speakerId, source_path AS path, confidence FROM audio_segments
    WHERE project_id = ? AND layer = 'original_reading' ORDER BY start_ms, id`).all(projectId) as unknown as CrewBrief["audio"];
  if (!alignedAudio.length) throw new Error("Ingest and align the source audio before role planning.");
  const speechRuns = readConfirmedSpeechRuns(db, projectId, dataDir);
  for (const segment of alignedAudio) {
    const run = speechRuns.find(r => r.members.some(m => m.id === segment.id));
    if (run) {
      segment.speechRun = { id: run.id, verseRef: run.verseRef, startMs: run.startMs, endMs: run.endMs, internalVerseTiming: run.internalVerseTiming };
      segment.safePauseAfter = segment.endMs === run.endMs || speechRunPauseIsSafe(db, projectId, run, segment.endMs);
    }
  }
  const audio: CrewBrief["audio"] = [];
  let end = 0;
  for (const segment of alignedAudio) {
    // NULL is a legitimate, expected state here (narration, an editorial
    // title card, or an unresolved gap) -- it makes no verse claim to
    // validate, unlike a shot's verse_ref just below, which always names a
    // real range and feeds straight into parseVerseRange.
    if (segment.verseRef !== null) checkRef(segment.verseRef);
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.startMs < end || segment.endMs <= segment.startMs) throw new Error("Source audio intervals have an overlap or invalid duration.");
    if (segment.startMs > end) {
      const previous = audio.at(-1);
      // No previous segment only means this is the recording's own leading
      // silence before its first detected interval -- unambiguously that
      // same segment's own recording, not a gap between two different
      // takes. A genuine gap between two already-seen segments whose paths
      // differ is the actually ambiguous case this still refuses to guess.
      if (previous && previous.path !== segment.path) throw new Error("Source audio intervals have a gap without an unambiguous source recording.");
      // Retain samples between aligned lines; never discard a breath or infer
      // silence/speaker identity from the absence of a database segment.
      audio.push({ id: `source-gap:${previous ? previous.id : "start"}:${segment.id}`, startMs: end, endMs: segment.startMs,
        verseRef: previous ? previous.verseRef : null, speakerId: null, path: segment.path, confidence: null, provenance: "unassigned_source_interval" });
    }
    audio.push(segment);
    end = segment.endMs;
  }
  for (const segment of audio) if (segment.speakerId) {
    const original = db.prepare("SELECT canon_status, group_id FROM characters WHERE id=?").get(segment.speakerId);
    if (original?.canon_status === "rejected" && original.group_id) {
      const spokespeople = db.prepare("SELECT id FROM characters WHERE group_id=? AND is_spokesperson=1 AND canon_status='approved'").all(original.group_id);
      if (spokespeople.length === 1) {
        segment.sourceSpeakerId = segment.speakerId;
        segment.speakerId = String(spokespeople[0]!.id);
      }
    }
  }
  for (const path of [...new Set(audio.map(a => a.path))]) source.hashes.push(digest(readFileSync(productionAssetPath(dataDir, path))));
  if (phase !== "planning") {
    const castMaster = db.prepare(`SELECT id,source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments
      WHERE project_id=? AND layer='composite_cast_master' ORDER BY id`).all(projectId);
    source.hashes.push(digest(JSON.stringify(castMaster)));
    for (const row of castMaster) source.hashes.push(digest(readFileSync(productionAssetPath(dataDir, String(row.source_path)))));
  }
  const shots = db.prepare(`SELECT s.id, s.scene_id AS sceneId, sc.sequence AS sceneSequence, s.sequence,
    s.verse_ref AS verseRef, s.action, s.framing, s.camera_movement AS cameraMovement,
    s.continuity_notes AS continuity, sc.lighting_continuity AS lighting, s.needs_lip_sync AS needsLipSync,
    sc.spatial_continuity AS spatialContinuity, s.spatial_view AS spatialView, s.crowd_density AS crowdDensity,
    s.dialogue_character_id AS dialogueCharacterId,
    (SELECT source_audio_segment_id FROM shot_utterance_bindings ub WHERE ub.shot_id=s.id) AS sourceSegmentId FROM shots s JOIN scenes sc ON sc.id = s.scene_id
    WHERE sc.project_id = ? ORDER BY sc.sequence, s.sequence`).all(projectId) as unknown as CrewShot[];
  if (!shots.length) throw new Error("Create the initial shot plan before running the production crew.");
  for (const shot of shots) {
    const binding = db.prepare("SELECT source_start_ms AS startMs,source_end_ms AS endMs FROM shot_utterance_bindings WHERE shot_id=?").get(shot.id) as { startMs: number; endMs: number } | undefined;
    if (binding) shot.utterance = { ...binding, speechRunId: speechRunBinding(db, shot.id)?.speechRunId };
    checkRef(shot.verseRef);
    const ref = parseVerseRange(shot.verseRef);
    if (!source.reference.some(v => v.verse === ref.start) || !source.reference.some(v => v.verse === ref.end)) throw new Error(`Shot ${shot.id} has no matching Scripture range.`);
    shot.needsLipSync = Boolean(shot.needsLipSync);
    shot.characterIds = (db.prepare("SELECT character_id AS id FROM shot_characters WHERE shot_id = ? ORDER BY character_id").all(shot.id) as Array<{ id: string }>).map(c => c.id);
    if (shot.needsLipSync && (!shot.dialogueCharacterId || !shot.characterIds.includes(shot.dialogueCharacterId))) throw new Error(`Shot ${shot.id} has no approved visible dialogue character.`);
    shot.beats = db.prepare(`SELECT id, sequence, notes, character_id AS characterId,
      audio_start_ms AS startMs, audio_end_ms AS endMs FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shot.id) as unknown as CrewShot["beats"];
    shot.clip = (db.prepare(`SELECT ga.id, ga.result_asset_path AS path,
      cl.timeline_end_ms - cl.timeline_start_ms AS durationMs FROM clips cl
      JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
      WHERE cl.shot_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
      ORDER BY ga.created_at DESC, ga.id DESC LIMIT 1`).get(shot.id) as CrewShot["clip"]) ?? null;
    if (phase !== "planning" && shot.clip) source.hashes.push(digest(readFileSync(productionAssetPath(dataDir, shot.clip.path))));
  }
  const canon: CrewBrief["canon"] = [];
  const characterIds = [...new Set([...shots.flatMap(s => [...s.characterIds, ...s.beats.flatMap(b => b.characterId ? [b.characterId] : [])]), ...audio.flatMap(a => a.speakerId ? [a.speakerId] : [])])].sort();
  for (const id of characterIds) {
    const character = db.prepare(`SELECT id, name, region, (SELECT notes FROM character_versions WHERE character_id = characters.id AND status = 'approved' LIMIT 1) AS notes, joined_narrative_at AS joinedAt FROM characters WHERE id = ?
      AND canon_status = 'approved' AND region = ? AND (scope_kind = 'global' OR
      (lower(scope_book) = lower(?) AND (scope_kind = 'book' OR scope_chapter = ?)))`)
      .get(id, approvedRegion, project.book, project.chapter) as Omit<CrewBrief["canon"][number], "versionId"> | undefined;
    const versions = db.prepare("SELECT id FROM character_versions WHERE character_id = ? AND status = 'approved'").all(id) as Array<{ id: string }>;
    if (!character || versions.length !== 1) throw new Error(`Character ${id} needs one approved, project-appropriate Papuan canon version.`);
    const assets = db.prepare("SELECT path, content_hash FROM character_assets WHERE character_version_id = ? ORDER BY path").all(versions[0]!.id) as Array<{ path: string; content_hash: string | null }>;
    if (!assets.length) throw new Error(`Missing approved reference assets for ${character.name}.`);
    for (const asset of assets) {
      const hash = digest(readFileSync(productionAssetPath(dataDir, asset.path)));
      if (asset.content_hash && asset.content_hash.toLowerCase() !== hash) throw new Error(`Canon file changed: ${character.name}.`);
      source.hashes.push(hash);
    }
    canon.push({ ...character, versionId: versions[0]!.id });
  }
  const regions = [...new Set(canon.map(character => character.region).filter(region => region.trim().length > 0))];
  if (regions.length !== 1) throw new Error("A crew brief requires one approved regional canon context for its visible cast.");
  const region = regions[0]!;
  // A typed asset-acceptance receipt is retained history, not a creative edit
  // that should invalidate other candidates in the same accepted revision.
  const producerNotes = db.prepare(`SELECT r.id, r.subject_id AS subjectId, r.note FROM review_notes r
    WHERE r.project_id = ? AND (r.source = 'human' OR (r.source = 'qc' AND r.note LIKE 'Production Director approved edit:%'))
    AND NOT EXISTS (SELECT 1 FROM edit_commands e WHERE e.project_id=r.project_id AND e.command_type='accept_media_candidate' AND json_extract(e.payload,'$.reviewNoteId')=r.id)
    ORDER BY r.created_at, r.id`).all(projectId) as CrewBrief["producerNotes"];
    if (phase === "planning") {
      const opening = db.prepare("SELECT plan_json FROM chapter_intro_plans WHERE project_id=?").get(projectId) as { plan_json: string } | undefined;
      if (opening) producerNotes.push({ id: "chapter-intro-plan", subjectId: projectId,
        note: `Separate pre-source-clock chapter opening plan (do not turn into verse-timed shots or accept media without target review): ${opening.plan_json}` });
      const ending = db.prepare("SELECT plan_json FROM chapter_ending_plans WHERE project_id=?").get(projectId) as { plan_json: string } | undefined;
      if (ending) producerNotes.push({ id: "chapter-ending-plan", subjectId: projectId,
        note: `Separate post-source chapter handoff toward the next verified first verse (an inferred visual bridge, not verse-timed Scripture; do not accept media without target review): ${ending.plan_json}` });
    }
  // A correction is local by default. Broader reuse requires an explicit scope
  // and matching value; never let a language/region label leak across contexts.
  const appliedLessons: NonNullable<CrewBrief["appliedLessons"]> = db.prepare(`SELECT id, subject_id AS subjectId, scope_kind AS scopeKind, requested_change AS requestedChange, rationale
    FROM production_lessons WHERE status='active' AND (
      (scope_kind='chapter' AND project_id=?) OR
      (scope_kind='shot' AND project_id=? AND subject_id IN (SELECT s.id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=?)) OR
      (scope_kind='scene' AND project_id=? AND subject_id IN (SELECT id FROM scenes WHERE project_id=?)) OR
      (scope_kind='book' AND lower(scope_value)=lower(?) AND lower(source_language)=lower(?) AND lower(source_region)=lower(?)) OR
      (scope_kind='language' AND lower(scope_value)=lower(?) AND lower(source_region)=lower(?)) OR
      (scope_kind='region' AND lower(scope_value)=lower(?) AND lower(source_language)=lower(?)) OR
      scope_kind='global'
    ) ORDER BY created_at,id`).all(projectId, projectId, projectId, projectId, projectId, project.book, project.language, region, project.language, region, region, project.language) as NonNullable<CrewBrief["appliedLessons"]>;
  // Published titles are optional scene context only. The Story Writer and
  // Shot Director decide whether an on-screen Hatam title serves the scene,
  // unless a human has already resolved that decision -- see the
  // film_treatment column on source_alignment_editorial_classifications.
  const resolvedTitleTreatments = new Map<number, { filmTreatment: string; reviewerName: string }>();
  try {
    for (const row of db.prepare(`SELECT next_verse_ref AS nextVerseRef, film_treatment AS filmTreatment, reviewer_name AS reviewerName
      FROM source_alignment_editorial_classifications WHERE project_id=? AND next_verse_ref IS NOT NULL AND film_treatment IS NOT NULL ORDER BY created_at`).all(projectId) as Array<{ nextVerseRef: string; filmTreatment: string; reviewerName: string }>) {
      const verse = Number(row.nextVerseRef.match(/:(\d+)/)?.[1]);
      if (Number.isFinite(verse)) resolvedTitleTreatments.set(verse, { filmTreatment: row.filmTreatment, reviewerName: row.reviewerName });
    }
  } catch { /* pre-migration test database */ }
  producerNotes.push(...parseNarratedParagraphTitles(sources[0]!).map((title,index)=>{
    const resolved = resolvedTitleTreatments.get(title.verseStart);
    const treatmentNote = !resolved ? `Optional scene-title context; do not automatically display it. Separate cross-reference metadata: (${title.parallelRefs}); do not treat it as film narration or on-screen content unless a human resolves an exception.`
      : resolved.filmTreatment === "title_card" ? `Human-resolved by ${resolved.reviewerName}: display as an on-screen title card. Cross-reference metadata: (${title.parallelRefs}); still not film narration.`
      : resolved.filmTreatment === "omit" ? `Human-resolved by ${resolved.reviewerName}: omit from the finished film; retained only as review evidence.`
      : `Human-resolved by ${resolved.reviewerName}: include as narrated content in the film's audio track. Cross-reference metadata: (${title.parallelRefs}).`;
    return { id: `source-title:${index}`, subjectId: projectId, note: `Narrated paragraph title before verse ${title.verseStart}: “${title.text}”. ${treatmentNote}` };
  }));
  producerNotes.push(...appliedLessons.map(lesson => ({ id: lesson.id, subjectId: lesson.subjectId ?? projectId, note: `Reusable lesson (${lesson.scopeKind}): ${lesson.requestedChange}${lesson.rationale ? ` Rationale: ${lesson.rationale}` : ""}` })));
  const spentUsd = Number(db.prepare("SELECT COALESCE(SUM(amount_usd), 0) AS total FROM cost_ledger_entries WHERE project_id = ?").get(projectId)!.total);
  const audioAssets = db.prepare(`SELECT id, kind, description, path, sha256, duration_ms AS durationMs
    FROM production_audio_assets WHERE project_id = ? ORDER BY id`).all(projectId) as CrewBrief["audioAssets"];
  for (const asset of audioAssets) if (digest(readFileSync(productionAssetPath(dataDir, asset.path))) !== asset.sha256) throw new Error(`Approved audio asset changed: ${asset.description}.`);
  let render: CrewBrief["render"] = null;
  if (phase === "finishing") {
    const row = db.prepare(`SELECT r.id, r.result_asset_path AS path, r.total_duration_ms AS durationMs,
      m.timeline_json AS timeline, m.source_audio_json AS audioMap FROM chapter_renders r LEFT JOIN chapter_render_manifests m ON m.render_id = r.id
      WHERE r.project_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 1`).get(projectId) as { id: string; path: string; durationMs: number; timeline: string | null; audioMap: string | null } | undefined;
    if (!row) throw new Error("Assemble a chapter before finishing review.");
    const audioMap = row.audioMap ? JSON.parse(row.audioMap) : undefined;
    render = { id: row.id, path: row.path, durationMs: row.durationMs, timeline: row.timeline ? JSON.parse(row.timeline) : [],
      audioMap: Array.isArray(audioMap) ? audioMap : undefined, sha256: digest(readFileSync(productionAssetPath(dataDir, row.path))) };
    const audit = readCutTimingAudit(db, projectId, row.id);
    if (audit?.renderSha256 === render.sha256 && JSON.stringify(audit.sourceHashes) === JSON.stringify(source.hashes)) render.timingAudit = audit;
    const applied = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='apply_finishing' AND json_extract(payload,'$.renderId')=? LIMIT 1").get(projectId, row.id);
    if (applied) {
      const payload = JSON.parse(String(applied.payload));
      const baseId = payload.baseRenderId ?? payload.parentRenderId;
      const base = db.prepare("SELECT result_asset_path AS path FROM chapter_renders WHERE id=? AND project_id=?").get(baseId, projectId);
      const reviewed = db.prepare("SELECT result_json FROM production_runs WHERE id=? AND project_id=?").get(payload.runId, projectId);
      if (!base || !reviewed) throw new Error("Finishing provenance is incomplete; preserve the existing cut and resolve its base render first.");
      render.finishing = { baseRenderId: baseId, basePath: String(base.path), baseSha256: digest(readFileSync(productionAssetPath(dataDir, String(base.path)))), previousDecisions: JSON.parse(String(reviewed.result_json)).contributions };
    }
  }
  const brief: CrewBrief = { project, source, audio, canon, shots, producerNotes, appliedLessons, spentUsd, audioAssets, render };
  if (phase !== "planning") {
    const plan = db.prepare("SELECT id,brief_hash,status,result_json FROM production_runs WHERE project_id=? AND phase='planning' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId);
    const result = plan?.result_json ? JSON.parse(String(plan.result_json)) as CrewResult : undefined;
    const treatment = result?.contributions?.creative_director?.emotionalTreatment;
    if (result?.emotionalTreatmentRequired && !treatment) throw new Error("Advance emotional treatment is incomplete; finish the current planning review before applying it to the cut.");
    if (treatment) {
      if (plan!.status !== "approved" || crewBriefHash(loadCrewBrief(db, dataDir, projectId, "planning"), "planning") !== plan!.brief_hash) throw new Error("Emotional treatment is held or stale; reconcile the current planning record before applying it.");
      brief.acceptedEmotionalTreatment = { runId: String(plan!.id), briefHash: String(plan!.brief_hash), treatment,
        producerOverrideShotIds: result?.productionRecord?.producerOverrideShotIds ?? [] };
    }
  }
  return brief;
}

/** Spend, output clips and soundtrack additions do not invalidate visual planning. */
export function crewBriefHash(brief: CrewBrief, phase: CrewPhase): string {
  // Cost ledger writes happen during every metered crew run. Cost is vital
  // provenance, but it is not a creative input; including it here makes an
  // editing/finishing run invalidate its own brief as soon as its first
  // metered call is recorded.
  if (phase !== "planning") return digest(JSON.stringify({ ...brief, spentUsd: 0 }));
  const { acceptedEmotionalTreatment: _treatment, ...planning } = brief;
  return digest(JSON.stringify({ ...planning, spentUsd: 0, audioAssets: [], render: null, shots: brief.shots.map(s => ({ ...s, clip: null })) }));
}
