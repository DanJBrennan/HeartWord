import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type EvaluationLabel = "accept" | "reject" | "hold";
export interface EvaluationPrediction { caseId: string; label: EvaluationLabel; confidence?: number; costUsd?: number; evidence: string; }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Persist only a human adjudication over an already-retained result. This is
 * deliberately not a mechanism for model self-approval or deployment. */
export function retainEvaluationCase(db: DatabaseSync, input: { projectId:string; subjectType:string; subjectId:string; artifactHash:string; evidence:unknown; label:EvaluationLabel; factual?:boolean; protected?:boolean; synthetic?:boolean }): string {
  if (!input.projectId || !input.subjectType || !input.subjectId || !input.artifactHash || !input.evidence) throw new Error("Evaluation case needs immutable provenance and a human label.");
  const id = randomUUID();
  db.prepare(`INSERT INTO evaluation_cases (id,project_id,subject_type,subject_id,artifact_hash,evidence_json,label,factual,protected,synthetic,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.projectId,input.subjectType,input.subjectId,input.artifactHash,JSON.stringify(input.evidence),input.label,input.factual ? 1 : 0,input.protected ? 1 : 0,input.synthetic ? 1 : 0,Date.now());
  return id;
}
export function compareEvaluation(db: DatabaseSync, input: { baselineVersion:string; candidateVersion:string; predictions:EvaluationPrediction[]; heldOutProjectId?:string }) {
  const cases = db.prepare(`SELECT * FROM evaluation_cases WHERE synthetic=0 ${input.heldOutProjectId ? "AND project_id != ?" : ""} ORDER BY created_at`).all(...(input.heldOutProjectId ? [input.heldOutProjectId] : [])) as Array<{id:string;label:EvaluationLabel;factual:number;protected:number;project_id:string}>;
  const byId = new Map(input.predictions.map(p => [p.caseId,p])); const scored = cases.filter(c => byId.has(c.id));
  const protectedRegression = scored.some(c => c.protected && byId.get(c.id)!.label !== c.label);
  const factual = scored.filter(c => c.factual); const correct = scored.filter(c => byId.get(c.id)!.label === c.label);
  const result = { caseCount:scored.length, excludedUnadjudicated:true, baselineVersion:input.baselineVersion,candidateVersion:input.candidateVersion, protectedRegression, accuracy: scored.length ? correct.length/scored.length : null, confidenceCalibration: factual.length >= 5 ? { sampleCount:factual.length, meanConfidence:factual.reduce((n,c)=>n+(byId.get(c.id)!.confidence ?? 0),0)/factual.length } : { sampleCount:factual.length, insufficient:true }, perCase:scored.map(c=>({caseId:c.id,label:c.label,prediction:byId.get(c.id)!})) };
  const recommendation = protectedRegression ? "do_not_adopt" : scored.length < 5 ? "insufficient_evidence" : "eligible_for_producer_review";
  const id=randomUUID(); db.prepare(`INSERT INTO evaluation_runs (id,baseline_version,candidate_version,case_ids_json,held_out_project_id,result_json,recommendation,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(id,input.baselineVersion,input.candidateVersion,JSON.stringify(scored.map(c=>c.id)),input.heldOutProjectId ?? null,JSON.stringify(result),recommendation,Date.now());
  return { id, recommendation, resultHash:digest(result), ...result };
}
