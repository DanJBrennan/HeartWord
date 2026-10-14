/** Authorized standalone POC comparison. Refuses a second run; no film/DB writes. */
import "dotenv/config";
import {createHash,randomUUID} from "node:crypto";
import {copyFileSync,constants,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {getDataDir} from "../src/db/client.js";
import {KlingLipSyncProvider} from "../src/providers/kling/index.js";
import {AVATAR_RESERVATION_RATE_USD,type AvatarDirection} from "../src/providers/kling/avatar-direction.js";

const root=getDataDir(),dir=join(root,"research/kling-avatar-2026-10-14");
const statePath=join(dir,"comparison-run.json");
if(existsSync(statePath))throw new Error("A comparison run is already retained. Inspect/recover existing external_task_id values; never implicitly submit again.");
const baseline=JSON.parse(readFileSync(join(dir,"gui-baseline.json"),"utf8"));
const inputRel="research/kling-avatar-poc-2026-10-14";
mkdirSync(join(root,"assets",inputRel),{recursive:true});
const hash=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex");
for(const file of ["gui-source-image.png","gui-original-test-audio.mp3"]){
  const to=join(root,"assets",inputRel,file);if(!existsSync(to))copyFileSync(join(dir,file),to,constants.COPYFILE_EXCL);
  if(hash(to)!==hash(join(dir,file)))throw new Error("POC input copy mismatch");
}
const prompt=String(baseline.gui.savedPrompt);
const technical="Preserve this same calm, warm expression and the reference identity, clothing and framing. Follow the supplied recording's syllables and pauses precisely with natural, readable mouth articulation. Keep gaze steady, with minimal head and shoulder movement and no added gestures or camera movement. Do not introduce a new emotional interpretation.";
const ceiling=Math.ceil(baseline.inputs.audio.guiDurationSeconds)*AVATAR_RESERVATION_RATE_USD;
const planned=[
  {id:"observable-prompt-std",prompt},
  {id:"restrained-technical-std",prompt:`${prompt}\n${technical}`}
].map(p=>({...p,requestId:randomUUID(),reservedUpperBoundUsd:ceiling,status:"reserved"}));
if(planned.reduce((n,p)=>n+p.reservedUpperBoundUsd,0)>5)throw new Error("Comparison exceeds its $5 new-direct-charge envelope");
const state:{[key:string]:unknown}={version:1,scope:"standalone proof of concept; Dan confirms it never belonged to a film",projectId:null,historicalGuiCostUsd:null,newDirectChargeLimitUsd:5,planned,startedAt:new Date().toISOString(),sourceSha256:baseline.inputs.audio.sha256,imageSha256:baseline.inputs.image.sha256,originalModeUnknown:true,modeChoice:"explicit std for both candidates to isolate direction; not certified original GUI mode",assistantDollarCost:null};
const save=()=>writeFileSync(statePath,JSON.stringify(state,null,2));save();
const outcomes=await Promise.allSettled(planned.map(async p=>{
  const direction:AvatarDirection={version:1,baseline:{id:"gui-317949919322306-observable-prompt",evidence:"Recovered saved GUI prompt; original mode/model unknown",prompt,mode:"std"},intent:{},overrides:p.id==="observable-prompt-std"?{}:{prompt:p.prompt},reason:p.id==="observable-prompt-std"?"Retain recovered prompt under an explicit common API mode":"Test clearer articulation with less distracting movement while preserving the approved POC expression; no passage emotion inferred",sourceEvidence:"Dan: a one-off proof of concept that never made it into a film. Exact uploaded audio and reference pixels retained; no Scripture/film binding or production-canon approval asserted.",continuityGroup:"standalone-poc-comparison",requiredControls:["image","sound_file","prompt","mode"]};
  const result=await new KlingLipSyncProvider().sync({characterId:"poc:reference-person",characterVersionId:`sha256:${baseline.inputs.image.sha256}`},{path:`${inputRel}/gui-original-test-audio.mp3`,startMs:0,endMs:Math.round(baseline.inputs.audio.guiDurationSeconds*1000)},{path:`${inputRel}/gui-source-image.png`},{avatarDirection:direction,requestId:p.requestId});
  Object.assign(p,{status:"returned_candidate",result,finishedAt:new Date().toISOString()});save();return result;
}));
outcomes.forEach((r,i)=>{if(r.status==="rejected")Object.assign(planned[i]!,{status:"outstanding_or_failed_no_retry",error:String(r.reason)});});
Object.assign(state,{finishedAt:new Date().toISOString(),status:outcomes.every(r=>r.status==="fulfilled")?"candidates_awaiting_review":"held_reconcile_outstanding",filmApproval:false});save();
console.log(JSON.stringify({statePath,status:state.status,outcomes:planned.map(p=>({id:p.id,requestId:p.requestId,status:p.status}))},null,2));
