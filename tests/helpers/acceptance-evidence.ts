/** Explicit synthetic-media assessments for mechanical fixtures only. These
 * assertions cannot certify identity, speech or action in real production media. */
import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";
import { productionAssetPath } from "../../src/pipeline/creative-direction/crew-context.js";
import { evidenceHash,mediaHash,recordAcceptanceReview,attemptAcceptanceTarget,type AcceptanceReview,type AcceptanceTarget } from "../../src/pipeline/qc/acceptance-evidence.js";
import { renderEditorialCut,renderProducerReviewedCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { applyFinishing,applyProducerReviewedFinishing } from "../../src/pipeline/assembly/finishing.js";
import { selectFinalVideoRange } from "../../src/pipeline/media-generation/final-video.js";
export function syntheticReview(target:AcceptanceTarget,dataDir:string):AcceptanceReview {
  const path=productionAssetPath(dataDir,target.path);
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",path],{encoding:"utf8",windowsHide:true}));
  const v=probe.streams.find((s:any)=>s.codec_type==="video"),rate=v.r_frame_rate.split("/").map(Number);
  return {kind:"media_acceptance_v1",key:target.key,contextHash:target.contextHash,mediaSha256:mediaHash(path),reviewer:"Synthetic fixture assertions; not production approval",
    input:{width:v.width,height:v.height,fps:rate[0]/rate[1],audioIncluded:probe.streams.some((s:any)=>s.codec_type==="audio")},
    checks:target.requirements.map(r=>({id:r.id,requirementHash:evidenceHash(r.text),status:"clear",evidence:"Synthetic fixture intentionally authored for mechanical stage assertions",ranges:[{startMs:0,endMs:target.durationMs}]}))};
}
function reviewedEncoded<T>(db:DatabaseSync,dataDir:string,projectId:string,run:()=>T):T {
  const count=()=>Number(db.prepare("SELECT COUNT(*) n FROM chapter_renders").get()!.n),before=count();
  try{return run();}catch(e){
    if(!(e instanceof Error)||!e.message.includes("missing structured actual-media"))throw e;
    expect(count()).toBe(before); // Missing evidence must never promote a render.
    const note=db.prepare("SELECT note FROM review_notes WHERE project_id=? AND json_valid(note) AND json_extract(note,'$.kind')='encoded_candidate_v1' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId);
    const candidate=JSON.parse(String(note!.note)),hash=mediaHash(productionAssetPath(dataDir,candidate.target.path));
    const review=syntheticReview(candidate.target,dataDir);
    const stale=structuredClone(review);stale.mediaSha256="parent-only-or-changed-bytes";
    recordAcceptanceReview(db,projectId,stale);expect(run).toThrow(/Stale/);expect(count()).toBe(before);
    for(const status of ["hold","unverified"] as const){
      const held=structuredClone(review);held.checks[0]!.status=status;
      recordAcceptanceReview(db,projectId,held);expect(run).toThrow(/failed or unverified/);expect(count()).toBe(before);
    }
    expect(mediaHash(productionAssetPath(dataDir,candidate.target.path))).toBe(hash);
    recordAcceptanceReview(db,projectId,review);
    const result=run();expect(mediaHash(productionAssetPath(dataDir,candidate.target.path))).toBe(hash);
    return result;
  }
}
export const reviewedEditorialCut:typeof renderEditorialCut=(db,dir,p,id)=>reviewedEncoded(db,dir,p,()=>renderEditorialCut(db,dir,p,id));
export const reviewedProducerCut:typeof renderProducerReviewedCut=(db,dir,p,r)=>reviewedEncoded(db,dir,p,()=>renderProducerReviewedCut(db,dir,p,r));
export const reviewedFinishing:typeof applyFinishing=(db,dir,p,id)=>reviewedEncoded(db,dir,p,()=>applyFinishing(db,dir,p,id));
export const reviewedProducerFinishing:typeof applyProducerReviewedFinishing=(db,dir,p,r)=>reviewedEncoded(db,dir,p,()=>applyProducerReviewedFinishing(db,dir,p,r));
export const reviewedRange:typeof selectFinalVideoRange=(db,p,id,range,review,dir)=>{
  try{return selectFinalVideoRange(db,p,id,range,review,dir);}catch(e){
    if(!(e instanceof Error)||!e.message.includes("missing structured actual-media"))throw e;
    const path=productionAssetPath(dir!,String(db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=?").get(id)!.result_asset_path));
    const v=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",path],{encoding:"utf8",windowsHide:true})).streams.find((s:any)=>s.codec_type==="video");
    const [n,d]=v.r_frame_rate.split("/").map(Number),duration=(range.endFrameExclusive-range.startFrame)*1000/(n/d);
    const target=attemptAcceptanceTarget(db,dir!,p,id,duration,range);
    recordAcceptanceReview(db,p,syntheticReview(target,dir!));return selectFinalVideoRange(db,p,id,range,review,dir);
  }
};
