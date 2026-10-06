import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sourceReviewHashes } from "./source-review.js";

/**
 * Splits one original-reading interval into two at a heard boundary, for
 * when automated segmentation merged genuinely distinct content (two
 * speakers, or dialogue mixed with narration) into one interval too coarse
 * to attribute -- see docs/plans/CURRENT_GOAL.md, 2026-09-18. Refuses if
 * the segment already carries corrections/editorial classifications/
 * speaker attributions/boundary overrides unless the caller explicitly
 * acknowledges them: this function never guesses which new segment
 * inherits prior evidence, and never deletes it. The two new segments
 * start with no verse_ref/confidence/speaker -- a human re-records
 * whatever evidence actually applies to each one.
 *
 * A re-ingestion after a manual split will not find an automated interval
 * matching either new segment's finer bounds, so any evidence recorded
 * against them will safely hold re-ingestion (the same "no exactly
 * equivalent replacement interval" guard used elsewhere) rather than
 * corrupt anything -- a known, accepted limitation, not silently unsafe.
 */
export function recordSegmentSplit(db: DatabaseSync, input: {
  projectId: string; audioSegmentId: string; splitAtMs: number;
  reviewerName: string; evidence: string; acknowledgeSupersededEvidence?: boolean;
}) {
  if (!input.reviewerName.trim() || !input.evidence.trim()) throw new Error("Named reviewer and evidence are required.");
  const segment = db.prepare("SELECT id,start_ms,end_ms,source_path FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'")
    .get(input.audioSegmentId, input.projectId) as { id: string; start_ms: number; end_ms: number; source_path: string } | undefined;
  if (!segment) throw new Error("The split target is not an original-reading interval in this chapter.");
  if (!Number.isFinite(input.splitAtMs) || input.splitAtMs <= segment.start_ms || input.splitAtMs >= segment.end_ms) {
    throw new Error("Split point must fall strictly inside the segment's current bounds.");
  }

  const correctionIds = (db.prepare("SELECT id FROM source_alignment_corrections WHERE audio_segment_id=?").all(input.audioSegmentId) as Array<{ id: string }>).map(r => r.id);
  const classificationIds = (db.prepare("SELECT id FROM source_alignment_editorial_classifications WHERE audio_segment_id=?").all(input.audioSegmentId) as Array<{ id: string }>).map(r => r.id);
  const attributionIds = (db.prepare("SELECT id FROM source_alignment_speaker_attributions WHERE audio_segment_id=?").all(input.audioSegmentId) as Array<{ id: string }>).map(r => r.id);
  const overrideIds = (db.prepare("SELECT id FROM source_alignment_boundary_overrides WHERE audio_segment_id=?").all(input.audioSegmentId) as Array<{ id: string }>).map(r => r.id);
  // A composite cast-master segment retains its provenance through this map.
  // It is a foreign-key dependency of the original interval just like the
  // review evidence below, even when the composite itself is narration-only.
  const compositeMapIds = (db.prepare("SELECT composite_segment_id FROM composite_audio_source_map WHERE original_segment_id=?").all(input.audioSegmentId) as Array<{ composite_segment_id: string }>).map(r => r.composite_segment_id);
  const hasExistingEvidence = correctionIds.length > 0 || classificationIds.length > 0 || attributionIds.length > 0 || overrideIds.length > 0;
  if (hasExistingEvidence && !input.acknowledgeSupersededEvidence) {
    throw new Error(
      "This segment already carries recorded evidence (correction, editorial classification, speaker attribution, or boundary override). " +
      "Pass acknowledgeSupersededEvidence to split anyway -- those rows are preserved as historical record but no longer apply to a live segment, " +
      "and must be re-recorded against whichever new segment they actually belong to."
    );
  }

  const firstId = randomUUID(), secondId = randomUUID(), splitId = randomUUID(), now = Date.now();
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES (?,?,'original_reading',?,?,?,NULL,NULL,NULL,?)")
      .run(firstId, input.projectId, segment.source_path, segment.start_ms, input.splitAtMs, now);
    db.prepare("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES (?,?,'original_reading',?,?,?,NULL,NULL,NULL,?)")
      .run(secondId, input.projectId, segment.source_path, input.splitAtMs, segment.end_ms, now);
    // Superseded evidence must be repointed (never left dangling) before the
    // original row can be deleted -- foreign_keys=ON (schema.sql) blocks
    // deleting a still-referenced row, same reason re-ingestion always
    // remaps before its own delete. Repointed onto the first new segment
    // purely to satisfy that constraint; superseded_*_ids above is the
    // actual record of what these rows meant, and a fresh, later-recorded
    // correction/attribution/classification against either new segment
    // naturally outranks them in the latest-wins display logic.
    if (correctionIds.length) db.prepare(`UPDATE source_alignment_corrections SET audio_segment_id=? WHERE id IN (${correctionIds.map(() => "?").join(",")})`).run(firstId, ...correctionIds);
    if (classificationIds.length) db.prepare(`UPDATE source_alignment_editorial_classifications SET audio_segment_id=? WHERE id IN (${classificationIds.map(() => "?").join(",")})`).run(firstId, ...classificationIds);
    if (attributionIds.length) db.prepare(`UPDATE source_alignment_speaker_attributions SET audio_segment_id=? WHERE id IN (${attributionIds.map(() => "?").join(",")})`).run(firstId, ...attributionIds);
    if (overrideIds.length) db.prepare(`UPDATE source_alignment_boundary_overrides SET audio_segment_id=? WHERE id IN (${overrideIds.map(() => "?").join(",")})`).run(firstId, ...overrideIds);
    // The composite is retained; its source map must move before deleting the
    // superseded source row. Like superseded review evidence, it is anchored
    // to the first replacement only to preserve referential integrity. A new
    // cast-master mapping for a later speaker split must be created from the
    // newly reviewed intervals, never inferred from this historical row.
    if (compositeMapIds.length) db.prepare(`UPDATE composite_audio_source_map SET original_segment_id=? WHERE composite_segment_id IN (${compositeMapIds.map(() => "?").join(",")})`).run(firstId, ...compositeMapIds);
    db.prepare("DELETE FROM audio_segments WHERE id=?").run(input.audioSegmentId);

    const hashes = sourceReviewHashes(db, input.projectId);
    db.prepare(`INSERT INTO source_alignment_segment_splits
        (id,project_id,original_segment_id,original_start_ms,original_end_ms,split_at_ms,first_segment_id,second_segment_id,
         superseded_correction_ids,superseded_editorial_classification_ids,superseded_speaker_attribution_ids,superseded_boundary_override_ids,
         reviewer_name,evidence,source_hash,alignment_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(splitId, input.projectId, input.audioSegmentId, segment.start_ms, segment.end_ms, input.splitAtMs, firstId, secondId,
        correctionIds.length ? JSON.stringify(correctionIds) : null,
        classificationIds.length ? JSON.stringify(classificationIds) : null,
        attributionIds.length ? JSON.stringify(attributionIds) : null,
        overrideIds.length ? JSON.stringify(overrideIds) : null,
        input.reviewerName.trim(), input.evidence.trim(), hashes.sourceHash, hashes.alignmentHash, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { splitId, firstSegmentId: firstId, secondSegmentId: secondId };
}
