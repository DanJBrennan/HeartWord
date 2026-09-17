import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type EvaluationLabel = "accept" | "reject" | "hold";
export interface EvaluationPrediction { caseId: string; label: EvaluationLabel; confidence?: number; costUsd?: number; evidence: string; trainingCaseIds?: string[]; }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const labels = new Set<EvaluationLabel>(["accept", "reject", "hold"]);

function requireSubject(db: DatabaseSync, projectId: string, type: string, id: string): void {
  const sql: Record<string, string> = {
    project: "SELECT id FROM projects WHERE id=? AND id=?",
    shot: "SELECT sh.id FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE sh.id=? AND s.project_id=?",
    clip: "SELECT c.id FROM clips c JOIN shots sh ON sh.id=c.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE c.id=? AND s.project_id=?",
    audio_segment: "SELECT id FROM audio_segments WHERE id=? AND project_id=?",
    review_note: "SELECT id FROM review_notes WHERE id=? AND project_id=?"
  };
  if (!sql[type] || !db.prepare(sql[type]!).get(id, projectId)) throw new Error("Evaluation case must link to a retained project record.");
}

/** Producer adjudication over a retained record. It is append-only by schema
 * trigger and is never a model label or an automatic deployment decision. */
export function retainEvaluationCase(db: DatabaseSync, input: { projectId:string; subjectType:"project"|"shot"|"clip"|"audio_segment"|"review_note"; subjectId:string; artifactHash:string; evidence:unknown; label:EvaluationLabel; factual?:boolean; protected?:boolean; synthetic?:boolean }): string {
  if (!input.projectId || !input.subjectId || !/^[a-f0-9]{6,}$/i.test(input.artifactHash) || !input.evidence || !labels.has(input.label)) throw new Error("Evaluation case needs immutable provenance and an explicit human label.");
  requireSubject(db, input.projectId, input.subjectType, input.subjectId);
  const id = randomUUID();
  db.prepare(`INSERT INTO evaluation_cases (id,project_id,subject_type,subject_id,artifact_hash,evidence_json,label,factual,protected,synthetic,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.projectId,input.subjectType,input.subjectId,input.artifactHash,JSON.stringify(input.evidence),input.label,input.factual ? 1 : 0,input.protected ? 1 : 0,input.synthetic ? 1 : 0,Date.now());
  return id;
}

function validatePrediction(db: DatabaseSync, p: EvaluationPrediction): void {
  if (!p.caseId || !labels.has(p.label) || !p.evidence?.trim()) throw new Error("Malformed evaluation prediction.");
  if (p.confidence !== undefined && (!Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 100)) throw new Error("Prediction confidence must be 0..100.");
  if (p.costUsd !== undefined && (!Number.isFinite(p.costUsd) || p.costUsd < 0)) throw new Error("Prediction cost must be non-negative.");
  if (!db.prepare("SELECT id FROM evaluation_cases WHERE id=?").get(p.caseId)) throw new Error("Prediction references an unknown evaluation case.");
  if (p.trainingCaseIds?.some(id => !db.prepare("SELECT id FROM evaluation_cases WHERE id=?").get(id))) throw new Error("Training provenance references an unknown evaluation case.");
}

/** Validate the entire file first, then atomically retain a versioned prediction set. */
export function importEvaluationPredictions(db: DatabaseSync, version: string, predictions: EvaluationPrediction[]): { imported: number; digest: string } {
  if (!version.trim() || !predictions.length) throw new Error("A version and nonempty prediction set are required.");
  const seen = new Set<string>();
  for (const p of predictions) { if (seen.has(p.caseId)) throw new Error("Prediction input duplicates a case."); seen.add(p.caseId); validatePrediction(db,p); }
  const ordered = predictions.map(p => ({...p, trainingCaseIds:[...(p.trainingCaseIds ?? [])].sort()})).sort((a,b)=>a.caseId.localeCompare(b.caseId));
  db.exec("BEGIN IMMEDIATE");
  try {
    const insert=db.prepare("INSERT INTO evaluation_predictions (id,evaluation_case_id,version,label,confidence,cost_usd,evidence,training_case_ids_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const p of ordered) insert.run(randomUUID(),p.caseId,version,p.label,p.confidence ?? null,p.costUsd ?? null,p.evidence,JSON.stringify(p.trainingCaseIds),Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return { imported:ordered.length, digest:digest({version,predictions:ordered}) };
}

export function exportEvaluationPredictions(db: DatabaseSync, version: string): { version:string; predictions:EvaluationPrediction[]; digest:string } {
  const predictions=(db.prepare("SELECT evaluation_case_id caseId,label,confidence,cost_usd costUsd,evidence,training_case_ids_json training FROM evaluation_predictions WHERE version=? ORDER BY evaluation_case_id").all(version) as Array<{caseId:string;label:EvaluationLabel;confidence:number|null;costUsd:number|null;evidence:string;training:string}>).map(p=>({caseId:p.caseId,label:p.label,...(p.confidence===null?{}:{confidence:p.confidence}),...(p.costUsd===null?{}:{costUsd:p.costUsd}),evidence:p.evidence,trainingCaseIds:JSON.parse(p.training) as string[]}));
  return {version,predictions,digest:digest({version,predictions})};
}

/** Compare two imported versions on human-adjudicated, non-synthetic cases.
 * A held-out chapter may not appear in candidate training provenance. */
export function compareEvaluation(db: DatabaseSync, input: { baselineVersion:string; candidateVersion:string; heldOutProjectId?:string }) {
  const cases=db.prepare("SELECT * FROM evaluation_cases WHERE synthetic=0 ORDER BY id").all() as Array<{id:string;label:EvaluationLabel;factual:number;protected:number;project_id:string}>;
  const baseline=new Map(exportEvaluationPredictions(db,input.baselineVersion).predictions.map(p=>[p.caseId,p]));
  const candidate=new Map(exportEvaluationPredictions(db,input.candidateVersion).predictions.map(p=>[p.caseId,p]));
  const heldOut=new Set(cases.filter(c=>c.project_id===input.heldOutProjectId).map(c=>c.id));
  const scored=cases.filter(c=>baseline.has(c.id)&&candidate.has(c.id)&&c.project_id!==input.heldOutProjectId);
  const leakage=scored.some(c=>(candidate.get(c.id)!.trainingCaseIds ?? []).some(id=>heldOut.has(id)));
  const accuracy=(set:Map<string,EvaluationPrediction>)=>scored.length ? scored.filter(c=>set.get(c.id)!.label===c.label).length/scored.length : null;
  const protectedRegression=scored.some(c=>c.protected&&candidate.get(c.id)!.label!==c.label);
  const factual=scored.filter(c=>c.factual&&candidate.get(c.id)!.confidence!==undefined);
  const confidenceCalibration=factual.length<5 ? {sampleCount:factual.length,insufficient:true} : {sampleCount:factual.length,meanConfidence:factual.reduce((n,c)=>n+candidate.get(c.id)!.confidence!,0)/factual.length,accuracy:factual.filter(c=>candidate.get(c.id)!.label===c.label).length/factual.length};
  const result={caseCount:scored.length,excludedUnadjudicated:true,excludedSynthetic:true,baselineVersion:input.baselineVersion,candidateVersion:input.candidateVersion,heldOutProjectId:input.heldOutProjectId ?? null,leakage,protectedRegression,baselineAccuracy:accuracy(baseline),candidateAccuracy:accuracy(candidate),confidenceCalibration,perCase:scored.map(c=>({caseId:c.id,label:c.label,baseline:baseline.get(c.id)!,candidate:candidate.get(c.id)!}))};
  const recommendation=protectedRegression||leakage ? "do_not_adopt" : scored.length<5 ? "insufficient_evidence" : "eligible_for_producer_review";
  const id=randomUUID(); db.prepare("INSERT INTO evaluation_runs (id,baseline_version,candidate_version,case_ids_json,held_out_project_id,result_json,recommendation,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id,input.baselineVersion,input.candidateVersion,JSON.stringify(scored.map(c=>c.id)),input.heldOutProjectId ?? null,JSON.stringify(result),recommendation,Date.now());
  return {id,recommendation,resultHash:digest(result),...result};
}
