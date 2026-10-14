/** Read-only production audit. No stage, provider, approval or schema writes. */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";
import { directSpeechRuns, incompleteSpeakerAttributionHold } from "../src/pipeline/ingestion/speaker-attribution-gate.js";
import { speechCoverageSegments, verseNumbers } from "../src/pipeline/ingestion/continuous-speech.js";
const root = "C:/Users/danbr/HeartWordData", databasePath = join(root, "db/heartword.sqlite");
// Keep the pre-change comparison reproducible after this audit is committed.
const legacyGateRevision = "cbed4f977a357a9eb754bb37cc8586cf17c97dcd";
const db = new DatabaseSync(databasePath, { readOnly: true });
db.exec("PRAGMA query_only=ON");
const databaseBefore = statSync(databasePath);
const digest = (value: unknown) => createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const databaseHashBefore = digest(readFileSync(databasePath));
const project = db.prepare("SELECT * FROM projects WHERE language='hatam' AND lower(book)='mark' AND chapter=4").get()!;
const projectId = String(project.id);
const rows = (table: string) => db.prepare(`SELECT * FROM ${table} WHERE project_id=?`).all(projectId);
db.exec("BEGIN");
try {
  const binding = db.prepare("SELECT * FROM project_source_bindings WHERE project_id=?").get(projectId)!;
  const sourceFiles = ["docx", "audio", "reference"].map(kind => {
    const path = join(root, "assets", String(binding[`${kind}_path`]));
    const sha256 = digest(readFileSync(path));
    return { kind, path, sha256, boundHash: binding[`${kind}_hash`], matches: sha256 === binding[`${kind}_hash`] };
  });
  const reference = parseSourceTextByVerse(sourceFiles[2]!.path), sourceText = parseSourceTextByVerse(sourceFiles[0]!.path);
  const currentEvidenceSourceHash = digest(sourceFiles.map(file => readFileSync(file.path)));
  // Duplicate only the pure SELECT/hash from sourceReviewHashes. That helper
  // also binds source paths, so it must not be invoked in a read-only audit.
  const currentAlignmentHash = digest(db.prepare("SELECT source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(projectId));
  const sourceReviews = rows("source_alignment_reviews");
  const sourceReviewApplicability = sourceReviews.map(review => ({ reviewId: review.id,
    sourceMatches: review.source_hash === currentEvidenceSourceHash,
    combinedAlignmentAndSpeakerHashMatches: review.alignment_hash === currentAlignmentHash,
    recordedAlignmentHash: review.alignment_hash }));
  const audio = db.prepare("SELECT a.*,c.name speaker_name FROM audio_segments a LEFT JOIN characters c ON c.id=a.speaker_character_id WHERE a.project_id=? ORDER BY a.layer,a.start_ms,a.id").all(projectId);
  const original = audio.filter(a => a.layer === "original_reading");
  const attributions = rows("source_alignment_speaker_attributions").sort((a, b) => Number(a.created_at) - Number(b.created_at));
  const corrections = rows("source_alignment_corrections").sort((a, b) => Number(a.created_at) - Number(b.created_at));
  const classifications = rows("source_alignment_editorial_classifications");
  const overrides = rows("source_alignment_boundary_overrides"), splits = rows("source_alignment_segment_splits"), merges = rows("source_alignment_segment_merges");
  const commands = rows("edit_commands");
  const newCoverage = speechCoverageSegments(db, projectId);
  const rawCoverage = original.map(a => ({ id: String(a.id), startMs: Number(a.start_ms), endMs: Number(a.end_ms), verseRef: a.verse_ref as string | null, speakerId: a.speaker_character_id as string | null }));
  const oldCode = execFileSync("git", ["show", `${legacyGateRevision}:src/pipeline/ingestion/speaker-attribution-gate.ts`], { encoding: "utf8" });
  const js = ts.transpileModule(oldCode, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const legacyExports: Record<string, (...args: unknown[]) => unknown> = {};
  new Function("exports", js)(legacyExports);
  const gateComparison = { referenceQuoteRuns: directSpeechRuns(reference),
    oldRuntimeRaw: legacyExports.incompleteSpeakerAttributionHold!(reference, rawCoverage),
    oldGateSameReviewedProjection: legacyExports.incompleteSpeakerAttributionHold!(reference, newCoverage),
    currentRuntimeReviewed: incompleteSpeakerAttributionHold(reference, newCoverage) };
  const present = (segments: typeof rawCoverage, expand: boolean) => new Set(segments.filter(s => s.speakerId).flatMap(s => expand ? verseNumbers(s.verseRef) : [Number(s.verseRef?.match(/:\s*(\d+)/)?.[1])]).filter(Number.isFinite));
  const rawPresent = present(rawCoverage, false), reviewedPresent = present(newCoverage, true);
  const quoteVerses = [...new Set(directSpeechRuns(reference).flat())];
  const presenceComparison = { rawMissing: quoteVerses.filter(v => !rawPresent.has(v)), reviewedMissing: quoteVerses.filter(v => !reviewedPresent.has(v)) };
  const partialRuns = directSpeechRuns(reference).flatMap(run => {
    const indices = newCoverage.flatMap((s, i) => verseNumbers(s.verseRef).some(v => run.includes(v)) ? [i] : []);
    if (!indices.length) return [];
    const firstNamed = newCoverage.findIndex((s, i) => i >= indices[0]! && i <= indices.at(-1)! && !!s.speakerId);
    if (firstNamed < 0) return [];
    const unassigned = newCoverage.slice(firstNamed, indices.at(-1)! + 1).filter(s => !s.speakerId && !s.reviewedNarration);
    return unassigned.length ? [{ verses: run, unassigned }] : [];
  });
  const enriched = original.map(a => {
    const speakerConfirmations = attributions.filter(row => row.audio_segment_id === a.id);
    const corrected = corrections.filter(row => row.audio_segment_id === a.id).at(-1);
    const coverage = newCoverage.find(row => row.id === a.id)!;
    return { ...a, reviewedVerseRef: coverage.verseRef, correction: corrected ?? null,
      speakerConfirmations, reviewedNarration: coverage.reviewedNarration };
  });
  const gaps = original.flatMap((a, i) => {
    const previous = original[i - 1], startMs = previous ? Number(previous.end_ms) : 0;
    return Number(a.start_ms) > startMs ? [{ startMs, endMs: Number(a.start_ms), durationMs: Number(a.start_ms) - startMs,
      beforeId: previous?.id ?? null, afterId: a.id,
      beforeSpeaker: previous?.speaker_name ?? null, afterSpeaker: a.speaker_name,
      beforeVerse: previous ? newCoverage.find(c => c.id === previous.id)?.verseRef : null,
      afterVerse: newCoverage.find(c => c.id === a.id)?.verseRef }] : [];
  });
  const joins = enriched.flatMap((a, i) => {
    const next = enriched[i + 1];
    if (!next || !a.speaker_character_id || a.speaker_character_id !== next.speaker_character_id) return [];
    const left = verseNumbers(a.reviewedVerseRef), right = verseNumbers(next.reviewedVerseRef);
    return [{ leftId: a.id, rightId: next.id, leftVerse: a.reviewedVerseRef, rightVerse: next.reviewedVerseRef,
      speaker: a.speaker_name, leftEndMs: Number(a.end_ms), rightStartMs: Number(next.start_ms),
      gapMs: Number(next.start_ms) - Number(a.end_ms), verseBoundary: left.length > 0 && right.length > 0 && left.at(-1) !== right[0],
      attributionEvidenceIds: [...a.speakerConfirmations, ...next.speakerConfirmations].map(row => row.id) }];
  });
  const shots = db.prepare(`SELECT sh.*,sc.sequence scene_sequence, c.name dialogue_name FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id LEFT JOIN characters c ON c.id=sh.dialogue_character_id WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence`).all(projectId);
  const utteranceBindings = db.prepare("SELECT ub.* FROM shot_utterance_bindings ub JOIN shots sh ON sh.id=ub.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?").all(projectId);
  const beats = db.prepare("SELECT cb.* FROM coverage_beats cb JOIN shots sh ON sh.id=cb.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sh.id,cb.sequence").all(projectId);
  const attempts = db.prepare("SELECT ga.* FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY ga.created_at,ga.id").all(projectId);
  const clips = db.prepare("SELECT cl.* FROM clips cl JOIN shots sh ON sh.id=cl.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY cl.id").all(projectId);
  const renders = rows("chapter_renders").sort((a, b) => Number(b.created_at) - Number(a.created_at));
  const manifests = db.prepare("SELECT m.* FROM chapter_render_manifests m JOIN chapter_renders r ON r.id=m.render_id WHERE r.project_id=?").all(projectId);
  const notes = rows("review_notes").sort((a, b) => Number(a.created_at) - Number(b.created_at));
  const alignment = rows("alignment_evidence").sort((a, b) => Number(b.created_at) - Number(a.created_at));
  const filePaths = [...new Set([...audio.map(a => String(a.source_path)), ...attempts.filter(a => a.status === "accepted" && a.result_asset_path).map(a => String(a.result_asset_path)), ...renders.map(r => String(r.result_asset_path))])];
  const retainedAssets = filePaths.map(path => {
    const absolute = join(root, "assets", path);
    if (!existsSync(absolute)) return { path, exists: false };
    const file = statSync(absolute); return { path, exists: true, bytes: file.size, modifiedMs: file.mtimeMs };
  });
  const latestRenderPath = join(root, "assets", String(renders[0]?.result_asset_path));
  const latestRenderHashBefore = existsSync(latestRenderPath) ? digest(readFileSync(latestRenderPath)) : null;
  const existingPerformanceWindows = shots.filter(sh => sh.needs_lip_sync && !utteranceBindings.some(b => b.shot_id === sh.id)).map(shot => {
    const retained = attempts.filter(a => a.shot_id === shot.id && /lip_sync/.test(String(a.operation)) && a.status === "accepted");
    const windows = retained.flatMap(a => {
      const match = String(a.prompt).match(/(?:exact\s+)?source(?:\s+interval)?\s+(\d+)\s*[-–]\s*(\d+)\s*ms/i);
      return match ? [{ attemptId: a.id, sourceStartMs: Number(match[1]), sourceEndMs: Number(match[2]), path: a.result_asset_path }] : [];
    });
    return { shotId: shot.id, verseRef: shot.verse_ref, retainedAcceptedExactWindows: windows };
  });
  const preservedRowsHash = digest({ audio, attributions, corrections, classifications, overrides, splits, merges, commands, shots, utteranceBindings, beats, attempts, clips, renders, manifests, notes });
  const result = { audit: "read-only Mark 4 continuous-speech compatibility", recordedAt: new Date().toISOString(),
    databasePath, project, legacyGateRevision, readOnly: true, queryOnly: db.prepare("PRAGMA query_only").get(), directProductionCostUsd: 0,
    sourceFiles, currentEvidenceSourceHash, currentAlignmentHash, sourceReviewApplicability,
    allAttributionSourceHashesMatch: attributions.every(a => a.source_hash === currentEvidenceSourceHash),
    sourceVerseCount: sourceText.length, referenceVerseCount: reference.length, reference,
    counts: { originalIntervals: original.length, attributedIntervals: original.filter(a => a.speaker_character_id).length,
      attributionRecords: attributions.length, typedSpeechRunRecords: commands.filter(c => c.command_type === "confirm_continuous_speech").length,
      corrections: corrections.length, shots: shots.length, exactShotBindings: utteranceBindings.length, beats: beats.length, clips: clips.length, attempts: attempts.length },
    gateComparison, presenceComparison, partialRuns, original: enriched, gaps, sameSpeakerJoins: joins, existingPerformanceWindows, classifications, overrides, splits, merges,
    sourceReviews, shots, utteranceBindings, beats, notes,
    attempts, clips, composite: audio.filter(a => a.layer === "composite_cast_master"),
    compositeMappings: db.prepare("SELECT m.* FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id WHERE a.project_id=?").all(projectId),
    renders, manifests, alignment, commands, retainedAssets, preservedRowsHash };
  db.exec("COMMIT");
  const databaseAfter = statSync(databasePath);
  const databaseHashAfter = digest(readFileSync(databasePath));
  const latestRenderHashAfter = existsSync(latestRenderPath) ? digest(readFileSync(latestRenderPath)) : null;
  const assetsUnchanged = retainedAssets.every(asset => !asset.exists || (statSync(join(root, "assets", asset.path)).size === asset.bytes && statSync(join(root, "assets", asset.path)).mtimeMs === asset.modifiedMs));
  writeFileSync("outputs/mark4-continuous-speech-audit.json", JSON.stringify({ ...result, preservation: {
    databaseSizeUnchanged: databaseBefore.size === databaseAfter.size, databaseModifiedTimeUnchanged: databaseBefore.mtimeMs === databaseAfter.mtimeMs,
    databaseHashBefore, databaseHashAfter, databaseBytesUnchanged: databaseHashBefore === databaseHashAfter,
    latestRenderPath, latestRenderHashBefore, latestRenderHashAfter, latestRenderBytesUnchanged: latestRenderHashBefore === latestRenderHashAfter,
    observedAssetStatsUnchanged: assetsUnchanged, statement: "Read-only SQLite transaction; no mutation, stage, provider, render, merge, binding, confirmation or approval function called. Asset metadata unchanged; this is not a fresh hash/quality review of every historical take." } }, null, 2));
  console.log(JSON.stringify({ counts: result.counts, gateComparison, sourceHashesMatch: sourceFiles.every(f => f.matches),
    presenceComparison, partialRuns, sameSpeakerJoins: joins.length, verseBoundaryJoins: joins.filter(j => j.verseBoundary).length,
    unboundPerformanceShots: existingPerformanceWindows.length, unboundPerformanceShotsWithRetainedExactWindows: existingPerformanceWindows.filter(w => w.retainedAcceptedExactWindows.length).length,
    allAttributionSourceHashesMatch: result.allAttributionSourceHashesMatch, sourceReviewApplicability,
    latestRender: renders[0], databaseBytesUnchanged: databaseHashBefore === databaseHashAfter,
    latestRenderBytesUnchanged: latestRenderHashBefore === latestRenderHashAfter, assetsUnchanged }, null, 2));
} catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
finally { db.close(); }
