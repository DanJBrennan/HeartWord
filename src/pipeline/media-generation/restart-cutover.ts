import type { DatabaseSync } from "node:sqlite";

export function recordRestartCutover(db:DatabaseSync,input:{projectId:string;approvedBy:string;reason:string;startedAt?:number}) {
  if (!input.approvedBy.trim() || !input.reason.trim()) throw new Error("A named producer and reason are required for a media restart cutover.");
  const existing=db.prepare("SELECT started_at FROM project_restart_cutovers WHERE project_id=?").get(input.projectId) as {started_at:number}|undefined;
  if (existing) return {startedAt:existing.started_at,reused:true};
  const startedAt=input.startedAt ?? Date.now();
  db.prepare("INSERT INTO project_restart_cutovers (project_id,started_at,approved_by,reason) VALUES (?,?,?,?)").run(input.projectId,startedAt,input.approvedBy.trim(),input.reason.trim());
  return {startedAt,reused:false};
}
