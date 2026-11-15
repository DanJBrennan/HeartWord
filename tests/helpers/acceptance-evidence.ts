/** Explicit synthetic-media assessments for mechanical fixtures only. These
 * assertions cannot certify identity, speech or action in real production media. */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";
import { productionAssetPath } from "../../src/pipeline/creative-direction/crew-context.js";
import { evidenceHash,mediaHash,recordAcceptanceReview,attemptAcceptanceTarget,measureSpeechEvidence,type AcceptanceReview,type AcceptanceTarget } from "../../src/pipeline/qc/acceptance-evidence.js";
import { renderEditorialCut,renderProducerReviewedCut } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { applyFinishing,applyProducerReviewedFinishing } from "../../src/pipeline/assembly/finishing.js";
import { selectFinalVideoRange } from "../../src/pipeline/media-generation/final-video.js";
export function syntheticReview(target:AcceptanceTarget,dataDir:string,db?:DatabaseSync):AcceptanceReview {
  const path=productionAssetPath(dataDir,target.path);
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",path],{encoding:"utf8",windowsHide:true}));
  const v=probe.streams.find((s:any)=>s.codec_type==="video"),rate=v.r_frame_rate.split("/").map(Number);
  const fps=rate[0]/rate[1],frames=Number(JSON.parse(execFileSync("ffprobe",["-v","error","-count_frames","-show_streams","-of","json",path],{encoding:"utf8",windowsHide:true})).streams.find((s:any)=>s.codec_type==="video").nb_read_frames);
  const sourceEvidenceNoteIds:string[]=[];
  const projectId=String(db?.prepare("SELECT id FROM projects LIMIT 1").get()?.id??"p");
  if(db){for(const [aspect,ids] of [
    ["linguistic_ownership",target.requirements.filter(r=>r.id==="source_boundaries"||r.id.startsWith("boundary:")).map(r=>r.id)],
    ["speaker_attribution",target.requirements.filter(r=>r.id==="audio:voice_ownership").map(r=>r.id)],
    ["sample_transport",target.requirements.filter(r=>r.id==="source_transport"||r.id==="audio:source_integrity").map(r=>r.id)]
  ] as const){if(!ids.length)continue;const id=randomUUID();
    const note={kind:"source_evidence_v1",sourceContextHash:target.sourceContextHash,aspect,reviewer:"EXPLICIT SYNTHETIC FIXTURE; no real language adjudication",status:"clear",checkIds:ids,evidence:"Synthetic mechanical fixture only",mediaSha256:mediaHash(path),
      provenance:aspect==="sample_transport"?{kind:"measured_transport",method:"Synthetic fixture assertions",inputHashes:target.sourceMediaHashes,resultHash:evidenceHash("synthetic measurement")}:aspect==="speaker_attribution"?{kind:"speaker_review",basis:"Synthetic independently known voice fixture"}:{kind:"competent_language_review",language:"hatam",competenceAttestation:"Synthetic test authority, not a real native approval"}};
    db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'project',?,?,?,0,?)").run(id,projectId,projectId,aspect==="sample_transport"?"qc":"human",JSON.stringify(note),Date.now());sourceEvidenceNoteIds.push(id);
  }}
  const speech=target.requirements.some(r=>r.id.startsWith("speech"))?measureSpeechEvidence(path,fps,frames):undefined;
  return {kind:"media_acceptance_v1",key:target.key,contextHash:target.contextHash,mediaSha256:mediaHash(path),reviewer:"Synthetic fixture assertions; not production approval",sourceEvidenceNoteIds,
    ...(speech?{speech:{measurementHash:evidenceHash(speech),reviewedFrames:[{startFrame:0,endFrameExclusive:frames}],observations:[...speech.windows.map(w=>({startMs:w.startMs,endMs:w.endMs,audio:w.rmsDbFS>=speech.quietReferenceDb?"signal_present" as const:"quiet" as const,mouth:"articulating" as const,evidence:"Explicit synthetic fixture observation, not a real mouth judgment"})),...(speech.audioEndMs<speech.durationMs?[{startMs:speech.audioEndMs,endMs:speech.durationMs,audio:"ended" as const,mouth:"closed" as const,evidence:"Explicit synthetic fixture track endpoint"}]:[])]}}:{}),
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
    const review=syntheticReview(candidate.target,dataDir,db);
    const stale=structuredClone(review);stale.mediaSha256="parent-only-or-changed-bytes";
    recordAcceptanceReview(db,projectId,stale);expect(run).toThrow(/Stale/);expect(count()).toBe(before);
    for(const status of ["hold","unverified"] as const){
      const held=structuredClone(review);held.checks[0]!.status=status;
      recordAcceptanceReview(db,projectId,held);expect(run).toThrow(/failed or unverified/);expect(count()).toBe(before);
    }
    const unscoped=structuredClone(review);unscoped.sourceEvidenceNoteIds=[];
    recordAcceptanceReview(db,projectId,unscoped);expect(run).toThrow(/scoped.*evidence/);expect(count()).toBe(before);
    const signal=review.speech?.observations.find(o=>o.audio==="signal_present");
    if(signal){const contradictory=structuredClone(review);contradictory.speech!.observations.find(o=>o.startMs===signal.startMs)!.audio="quiet";
      recordAcceptanceReview(db,projectId,contradictory);expect(run).toThrow(/claimed quiet/);expect(count()).toBe(before);}
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
