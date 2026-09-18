import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sourceReviewHashes } from "./source-review.js";

export type EditorialClassification = "narrated_title_cross_reference" | "mixed_editorial_transition";

export function editorialAlignmentDisplay(classification: EditorialClassification) {
  return classification === "mixed_editorial_transition"
    ? "Human-reviewed title/cross-reference transition — film treatment held for review"
    : "Human-reviewed narrated title/cross-reference — film treatment held for review";
}

export function recordSourceAlignmentEditorialClassification(db: DatabaseSync, input: {
  projectId: string; audioSegmentId: string; classification: EditorialClassification;
  titleText: string; crossReferenceText: string; nextVerseRef?: string | null;
  reviewerName: string; evidence: string;
}) {
  if (!input.reviewerName.trim() || !input.evidence.trim() || !input.titleText.trim() || !input.crossReferenceText.trim()) {
    throw new Error("Named reviewer, evidence, title text, and cross-reference text are required.");
  }
  if (input.nextVerseRef && !/^Mark \d+:\d+(?:-\d+)?$/.test(input.nextVerseRef)) throw new Error("Next verse reference must be canonical when provided.");
  const segment = db.prepare("SELECT id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(input.audioSegmentId, input.projectId);
  if (!segment) throw new Error("The classification target is not an original-reading interval in this chapter.");
  const hashes = sourceReviewHashes(db, input.projectId), id = randomUUID();
  db.prepare("INSERT INTO source_alignment_editorial_classifications (id,project_id,audio_segment_id,classification,title_text,cross_reference_text,next_verse_ref,reviewer_name,evidence,source_hash,alignment_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, input.projectId, input.audioSegmentId, input.classification, input.titleText.trim(), input.crossReferenceText.trim(), input.nextVerseRef ?? null, input.reviewerName.trim(), input.evidence.trim(), hashes.sourceHash, hashes.alignmentHash, Date.now());
  return id;
}
