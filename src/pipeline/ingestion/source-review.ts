import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { ProjectRow } from "./index.js";
import { resolveAndBindSourcePaths } from "./source-catalog.js";
const hash=(v: unknown)=>createHash("sha256").update(typeof v === "string"||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest("hex");
export function sourceReviewHashes(db:DatabaseSync, projectId:string, dataDir?: string) {
 const p=db.prepare("SELECT id,language,book,chapter FROM projects WHERE id=?").get(projectId) as ProjectRow|undefined; if(!p)throw new Error("Project not found.");
 const paths=resolveAndBindSourcePaths(db,p,dataDir); const segments=db.prepare("SELECT source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(projectId);
 return {sourceHash:hash([readFileSync(paths.docxPath),readFileSync(paths.audioPath),readFileSync(paths.referencePath)]),alignmentHash:hash(segments)};
}
export function attestSourceAlignment(db:DatabaseSync,input:{projectId:string;reviewerName:string;attestation:string;evidence:string}) {
 if(!input.reviewerName.trim()||!input.attestation.trim()||!input.evidence.trim())throw new Error("Named human attestation and evidence are required.");
 const {sourceHash,alignmentHash}=sourceReviewHashes(db,input.projectId); const id=randomUUID();
 db.prepare("INSERT INTO source_alignment_reviews (id,project_id,reviewer_name,reviewer_attestation,source_hash,alignment_hash,evidence,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id,input.projectId,input.reviewerName.trim(),input.attestation.trim(),sourceHash,alignmentHash,input.evidence,Date.now()); return id;
}
export function hasCurrentSourceReview(db:DatabaseSync,projectId:string) { const h=sourceReviewHashes(db,projectId); return !!db.prepare("SELECT id FROM source_alignment_reviews WHERE project_id=? AND source_hash=? AND alignment_hash=?").get(projectId,h.sourceHash,h.alignmentHash); }
