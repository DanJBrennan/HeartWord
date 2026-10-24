import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sourceReviewHashes } from "./source-review.js";

/**
 * Merges two adjacent original-reading intervals into one, for when
 * automated segmentation split one genuinely continuous utterance (e.g. an
 * interior multi-verse quotation, one aligner row per verse) into pieces
 * too fine for a single shot's utterance binding to cover -- see
 * docs/plans/CURRENT_GOAL.md, 2026-09-19. The inverse of segment-splits.ts,
 * with the same evidence discipline: refuses if either segment already
 * carries corrections/editorial classifications/speaker attributions/
 * boundary overrides unless the caller explicitly acknowledges them, never
 * guesses which evidence still applies, and never deletes it. The merged
 * segment starts with no verse_ref/confidence/speaker -- a human re-records
 * whatever evidence actually applies to the combined interval.
 */
export function recordSegmentMerge(db: DatabaseSync, input: {
  projectId: string; firstSegmentId: string; secondSegmentId: string;
  reviewerName: string; evidence: string; acknowledgeSupersededEvidence?: boolean;
}) {
  if (!input.reviewerName.trim() || !input.evidence.trim()) throw new Error("Named reviewer and evidence are required.");
  const load = (id: string) => db.prepare("SELECT id,start_ms,end_ms,source_path FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'")
    .get(id, input.projectId) as { id: string; start_ms: number; end_ms: number; source_path: string } | undefined;
  const first = load(input.firstSegmentId), second = load(input.secondSegmentId);
  if (!first || !second) throw new Error("Both merge targets must be original-reading intervals in this chapter.");
  if (first.source_path !== second.source_path) throw new Error("Cannot merge segments from different source recordings.");
  if (first.start_ms >= second.start_ms) throw new Error("firstSegmentId must start before secondSegmentId.");
  if (second.start_ms < first.end_ms) throw new Error("Merge targets must not overlap.");
  const between = db.prepare("SELECT id FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms >= ? AND start_ms < ?")
    .get(input.projectId, first.end_ms, second.start_ms);
  if (between) throw new Error("Another interval falls between these two segments; merge targets must be immediately adjacent.");
  const boundShot = db.prepare("SELECT shot_id FROM shot_utterance_bindings WHERE source_audio_segment_id IN (?,?)").get(input.firstSegmentId, input.secondSegmentId) as { shot_id: string } | undefined;
  if (boundShot) throw new Error("A shot is already bound to one of these segments; unbind it before merging.");

  const evidenceIds = (table: string) => (db.prepare(`SELECT id FROM ${table} WHERE audio_segment_id IN (?,?)`).all(input.firstSegmentId, input.secondSegmentId) as Array<{ id: string }>).map(r => r.id);
  const correctionIds = evidenceIds("source_alignment_corrections");
  const classificationIds = evidenceIds("source_alignment_editorial_classifications");
  const attributionIds = evidenceIds("source_alignment_speaker_attributions");
  const overrideIds = evidenceIds("source_alignment_boundary_overrides");
  const hasExistingEvidence = correctionIds.length > 0 || classificationIds.length > 0 || attributionIds.length > 0 || overrideIds.length > 0;
  if (hasExistingEvidence && !input.acknowledgeSupersededEvidence) {
    throw new Error(
      "One or both segments already carry recorded evidence (correction, editorial classification, speaker attribution, or boundary override). " +
      "Pass acknowledgeSupersededEvidence to merge anyway -- those rows are preserved as historical record but no longer apply to a live segment, " +
      "and must be re-recorded against the merged segment."
    );
  }

  const mergedId = randomUUID(), mergeId = randomUUID(), now = Date.now();
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES (?,?,'original_reading',?,?,?,NULL,NULL,NULL,?)")
      .run(mergedId, input.projectId, first.source_path, first.start_ms, second.end_ms, now);
    // Superseded evidence must be repointed (never left dangling) before the
    // original rows can be deleted -- foreign_keys=ON (schema.sql) blocks
    // deleting a still-referenced row, same reason segment-splits.ts always
    // remaps before its own delete. superseded_*_ids above is the actual
    // record of what these rows meant; a fresh, later-recorded correction/
    // attribution/classification against the merged segment naturally
    // outranks them in the latest-wins display logic.
    if (correctionIds.length) db.prepare(`UPDATE source_alignment_corrections SET audio_segment_id=? WHERE id IN (${correctionIds.map(() => "?").join(",")})`).run(mergedId, ...correctionIds);
    if (classificationIds.length) db.prepare(`UPDATE source_alignment_editorial_classifications SET audio_segment_id=? WHERE id IN (${classificationIds.map(() => "?").join(",")})`).run(mergedId, ...classificationIds);
    if (attributionIds.length) db.prepare(`UPDATE source_alignment_speaker_attributions SET audio_segment_id=? WHERE id IN (${attributionIds.map(() => "?").join(",")})`).run(mergedId, ...attributionIds);
    if (overrideIds.length) db.prepare(`UPDATE source_alignment_boundary_overrides SET audio_segment_id=? WHERE id IN (${overrideIds.map(() => "?").join(",")})`).run(mergedId, ...overrideIds);
    db.prepare("DELETE FROM audio_segments WHERE id=?").run(input.firstSegmentId);
    db.prepare("DELETE FROM audio_segments WHERE id=?").run(input.secondSegmentId);

    const hashes = sourceReviewHashes(db, input.projectId);
    db.prepare(`INSERT INTO source_alignment_segment_merges
        (id,project_id,first_segment_id,second_segment_id,first_start_ms,first_end_ms,second_start_ms,second_end_ms,merged_segment_id,
         superseded_correction_ids,superseded_editorial_classification_ids,superseded_speaker_attribution_ids,superseded_boundary_override_ids,
         reviewer_name,evidence,source_hash,alignment_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(mergeId, input.projectId, input.firstSegmentId, input.secondSegmentId, first.start_ms, first.end_ms, second.start_ms, second.end_ms, mergedId,
        correctionIds.length ? JSON.stringify(correctionIds) : null,
        classificationIds.length ? JSON.stringify(classificationIds) : null,
        attributionIds.length ? JSON.stringify(attributionIds) : null,
        overrideIds.length ? JSON.stringify(overrideIds) : null,
        input.reviewerName.trim(), input.evidence.trim(), hashes.sourceHash, hashes.alignmentHash, now);
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction) db.exec("ROLLBACK");
    throw error;
  }

  return { mergeId, mergedSegmentId: mergedId };
}
