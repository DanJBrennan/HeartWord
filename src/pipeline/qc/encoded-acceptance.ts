import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { productionAssetPath } from "../creative-direction/crew-context.js";
import { assertAcceptanceEvidence, mediaHash, type AcceptanceTarget } from "./acceptance-evidence.js";
import { assertNoRenderedFlashes } from "./flash-detection.js";
import { postRenderPromotionHolds } from "./post-render-scorecard.js";

/** Unpromoted render retained in existing QC notes. Retry reviews these same
 * bytes; it does not render again, alter a historical render or call a provider. */
export interface EncodedCandidate<T> { kind:"encoded_candidate_v1"; target:AcceptanceTarget; sha256:string; metadata:T }
export function pendingEncodedCandidate<T>(db:DatabaseSync,projectId:string,key:string):EncodedCandidate<T>|undefined {
  for(const row of db.prepare("SELECT note FROM review_notes WHERE project_id=? AND source='qc' ORDER BY created_at DESC,rowid DESC").all(projectId)) {
    try{const note=JSON.parse(String(row.note));if(note.kind==="encoded_candidate_v1"&&note.target.key===key)return note;}catch{/* Retain unrelated notes. */}
  }
  return undefined;
}
export function retainEncodedCandidate<T>(db:DatabaseSync,dataDir:string,projectId:string,target:AcceptanceTarget,metadata:T):EncodedCandidate<T> {
  const candidate:EncodedCandidate<T>={kind:"encoded_candidate_v1",target,metadata,sha256:mediaHash(productionAssetPath(dataDir,target.path))};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'project',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,projectId,JSON.stringify(candidate),Date.now());return candidate;
}
export function assertEncodedAcceptance<T>(db:DatabaseSync,dataDir:string,projectId:string,current:AcceptanceTarget,candidate:EncodedCandidate<T>):void {
  const path=productionAssetPath(dataDir,candidate.target.path);
  if(current.contextHash!==candidate.target.contextHash||current.key!==candidate.target.key||mediaHash(path)!==candidate.sha256)
    throw Error("QC hold: retained encoded candidate or its source/canon/cut inputs changed; preserve it and use a new review identity.");
  assertNoRenderedFlashes(path);
  const review=assertAcceptanceEvidence(db,dataDir,projectId,{...current,path:candidate.target.path});
  const rate=Number(execFileSync("ffprobe",["-v","error","-select_streams","a:0","-show_entries","stream=sample_rate","-of","csv=p=0",path],{encoding:"utf8",windowsHide:true}).trim());
  const findings=(id:string)=>review.checks.filter(c=>c.id===`render:${id}`&&c.status!=="clear");
  const holds=postRenderPromotionHolds({flashes_le5frames:[],static_shots_ge3s:findings("static"),near_duplicate_pairs:findings("duplicates"),
    unintended_sub_1p5s_shots:findings("short_inserts"),within_scene_large_colour_jumps:findings("colour"),regression_failures:findings("regressions"),
    minimum_minute_p10_db:null,breath_levels_db:[],audio_sample_rate_hz:rate},{ambienceFloor:false,breathLevels:false});
  if(holds.length)throw Error(`QC hold: ${holds.join(" ")}`);
}
