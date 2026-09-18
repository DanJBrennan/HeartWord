import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
export function recordBoundaryOverride(db:DatabaseSync,input:{projectId:string;segmentId:string;startMs:number;endMs:number;reviewerName:string;evidence:string}) {
 const row=db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(input.segmentId,input.projectId) as {start_ms:number;end_ms:number}|undefined;
 if(!row||!input.reviewerName.trim()||!input.evidence.trim()||input.endMs>row.end_ms||input.endMs<=input.startMs)throw new Error("Boundary override must be a named, evidenced source-interval boundary.");
 const id=randomUUID();db.prepare("INSERT INTO source_alignment_boundary_overrides (id,project_id,audio_segment_id,original_start_ms,original_end_ms,start_ms,end_ms,reviewer_name,evidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id,input.projectId,input.segmentId,row.start_ms,row.end_ms,input.startMs,input.endMs,input.reviewerName.trim(),input.evidence.trim(),Date.now());
 db.prepare("UPDATE audio_segments SET start_ms=?,end_ms=? WHERE id=?").run(input.startMs,input.endMs,input.segmentId);return id;
}
