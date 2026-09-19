import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sourceReviewHashes } from "./source-review.js";

/**
 * Records a named, evidenced attribution of an original-reading interval to
 * the character whose direct speech it is, and immediately writes the real
 * audio_segments.speaker_character_id column -- casting
 * (src/pipeline/casting/index.ts) reads that column directly, unlike
 * corrections/editorial classifications which are only ever layered onto
 * the API projection. Append-only: recording a later attribution for the
 * same segment overwrites the column again, same latest-wins convention as
 * the rest of this evidence family.
 */
export function recordSourceAlignmentSpeakerAttribution(db: DatabaseSync, input: {
  projectId: string; audioSegmentId: string; characterId: string;
  verseRef?: string | null; reviewerName: string; evidence: string;
}) {
  if (!input.reviewerName.trim() || !input.evidence.trim()) throw new Error("Named reviewer and evidence are required.");
  if (input.verseRef && !/^Mark \d+:\d+(?:-\d+)?$/.test(input.verseRef)) throw new Error("Verse reference must be canonical when provided.");
  const segment = db.prepare("SELECT id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(input.audioSegmentId, input.projectId);
  if (!segment) throw new Error("The attribution target is not an original-reading interval in this chapter.");
  const character = db.prepare("SELECT id FROM characters WHERE id=? AND canon_status='approved'").get(input.characterId);
  if (!character) throw new Error("Speaker must be an approved canon character.");
  const hashes = sourceReviewHashes(db, input.projectId), id = randomUUID();
  db.prepare("INSERT INTO source_alignment_speaker_attributions (id,project_id,audio_segment_id,character_id,verse_ref,reviewer_name,evidence,source_hash,alignment_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, input.projectId, input.audioSegmentId, input.characterId, input.verseRef ?? null, input.reviewerName.trim(), input.evidence.trim(), hashes.sourceHash, hashes.alignmentHash, Date.now());
  db.prepare("UPDATE audio_segments SET speaker_character_id=? WHERE id=?").run(input.characterId, input.audioSegmentId);
  return id;
}
