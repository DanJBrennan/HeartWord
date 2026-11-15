import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sourceReviewHashes } from "./source-review.js";

export type EditorialClassification = "narrated_title_cross_reference" | "mixed_editorial_transition";
/** A producer's resolved decision for how a narrated title/reference appears
 *  in the finished film: on screen only, cut from the film, or narrated in
 *  its audio track. Undecided is represented by omitting this, not a value. */
export type FilmTreatment = "title_card" | "omit" | "narrated";

export function editorialAlignmentDisplay(classification: EditorialClassification, filmTreatment?: FilmTreatment | null) {
  const base = classification === "mixed_editorial_transition"
    ? "Human-reviewed title/cross-reference transition"
    : "Human-reviewed narrated title/cross-reference";
  if (filmTreatment === "title_card") return `${base} — resolved: on-screen title card`;
  if (filmTreatment === "omit") return `${base} — resolved: omitted from film, evidence retained`;
  if (filmTreatment === "narrated") return `${base} — resolved: included as narrated film content`;
  return `${base} — film treatment held for review`;
}

export function recordSourceAlignmentEditorialClassification(db: DatabaseSync, input: {
  projectId: string; audioSegmentId: string; classification: EditorialClassification;
  titleText: string; crossReferenceText: string; nextVerseRef?: string | null;
  reviewerName: string; evidence: string; filmTreatment?: FilmTreatment | null;
}) {
  if (!input.reviewerName.trim() || !input.evidence.trim() || !input.titleText.trim() || !input.crossReferenceText.trim()) {
    throw new Error("Named reviewer, evidence, title text, and cross-reference text are required.");
  }
  if (input.nextVerseRef && !/^Mark \d+:\d+(?:-\d+)?$/.test(input.nextVerseRef)) throw new Error("Next verse reference must be canonical when provided.");
  if (input.filmTreatment && !["title_card", "omit", "narrated"].includes(input.filmTreatment)) throw new Error("Film treatment must be title_card, omit, or narrated when provided.");
  const segment = db.prepare("SELECT id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(input.audioSegmentId, input.projectId);
  if (!segment) throw new Error("The classification target is not an original-reading interval in this chapter.");
  const hashes = sourceReviewHashes(db, input.projectId), id = randomUUID();
  db.prepare("INSERT INTO source_alignment_editorial_classifications (id,project_id,audio_segment_id,classification,title_text,cross_reference_text,next_verse_ref,reviewer_name,evidence,film_treatment,source_hash,alignment_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, input.projectId, input.audioSegmentId, input.classification, input.titleText.trim(), input.crossReferenceText.trim(), input.nextVerseRef ?? null, input.reviewerName.trim(), input.evidence.trim(), input.filmTreatment ?? null, hashes.sourceHash, hashes.alignmentHash, Date.now());
  return id;
}
