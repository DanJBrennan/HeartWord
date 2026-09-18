import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sourceReviewHashes } from "./source-review.js";

export function recordSourceAlignmentCorrection(db:DatabaseSync,input:{projectId:string;audioSegmentId:string;verseRef:string;assignedText:string;reviewerName:string;evidence:string}) {
  if(!input.reviewerName.trim()||!input.evidence.trim()||!input.assignedText.trim()||!/^Mark \d+:\d+(?:-\d+)?$/.test(input.verseRef))throw new Error("Named reviewer, evidence, assigned text, and a canonical verse reference are required.");
  const segment=db.prepare("SELECT id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(input.audioSegmentId,input.projectId);
  if(!segment)throw new Error("The correction target is not an original-reading interval in this chapter.");
  const hashes=sourceReviewHashes(db,input.projectId), id=randomUUID();
  db.prepare("INSERT INTO source_alignment_corrections (id,project_id,audio_segment_id,verse_ref,assigned_text,reviewer_name,evidence,source_hash,alignment_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id,input.projectId,input.audioSegmentId,input.verseRef,input.assignedText.trim(),input.reviewerName.trim(),input.evidence.trim(),hashes.sourceHash,hashes.alignmentHash,Date.now());
  return id;
}
