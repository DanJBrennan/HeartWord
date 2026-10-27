/** Select one reviewed, source-bound single-face Avatar take using a pinned donor still. */
import "dotenv/config";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {dirname,join,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {getDb} from "../src/db/client.js";
import {editionSpeakingDonorKeyframe,readLanguageEditionPlan} from "../src/pipeline/language-edition.js";
import {acceptLipSyncCandidate} from "../src/pipeline/voice-lipsync/candidate-selection.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rootRel=relative(checkout,root);
if(rootRel===".."||rootRel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah project may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",reviewPath=process.argv[2];
if(!reviewPath)throw new Error("Usage: select-isolated-mark4-meyah-single-face-sync <absolute-review-json>");
const reviewAbs=resolve(reviewPath),reviewRel=relative(root,reviewAbs);
if(reviewRel===".."||reviewRel.startsWith(`..${sep}`)||!reviewRel.startsWith(`review${sep}`)||!existsSync(reviewAbs))
  throw new Error("The decision must be saved in the isolated review directory.");
const reviewBytes=readFileSync(reviewAbs),review=JSON.parse(reviewBytes.toString("utf8")) as {
  kind:string;projectId:string;shotId:string;attemptId:string;requestId:string;outputSha256:string;
  sourceStartMs:number;sourceEndMs:number;donorFrameSha256:string;submittedAudioSha256:string;
  providerAudioDelayMs:number;providerAudioAlignedCorrelation:number;contactPath:string;
  pictureEvidence:string;audioEvidence:string;backupPath:string;pictureTailPadMs?:number;
};
if(review.kind!=="isolated_meyah_mark4_single_face_avatar_editorial_selection"||review.projectId!==projectId||
  !/^[a-f0-9-]{36}$/.test(review.shotId)||!/^[a-f0-9-]{36}$/.test(review.requestId)||
  !review.pictureEvidence?.trim()||!review.audioEvidence?.trim()||
  !Number.isFinite(review.providerAudioDelayMs)||Math.abs(review.providerAudioDelayMs)>33.4||
  !Number.isFinite(review.providerAudioAlignedCorrelation)||review.providerAudioAlignedCorrelation<0.98)
  throw new Error("A named, evidence-backed picture and source-audio decision is required.");
const inside=(path:string,section:string)=>{
  const full=resolve(root,path),rel=relative(root,full);
  if(rel===".."||rel.startsWith(`..${sep}`)||!rel.startsWith(`${section}${sep}`)||!existsSync(full))
    throw new Error(`Reviewed ${section} evidence is outside the isolated project.`);
  return full;
};
inside(review.contactPath,"review");inside(review.backupPath,"review");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Approved edition shot map changed.");
const row=db.prepare(`SELECT ga.status,ga.result_asset_path,ga.provider,sh.dialogue_character_id,
  b.source_start_ms,b.source_end_ms FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id
  JOIN scenes sc ON sc.id=sh.scene_id JOIN shot_utterance_bindings b ON b.shot_id=sh.id
  WHERE ga.id=? AND ga.shot_id=? AND ga.operation='lip_sync' AND sc.project_id=?`)
  .get(review.attemptId,review.shotId,projectId) as {status:string;result_asset_path:string;provider:string;
  dialogue_character_id:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!row||row.status!=="hold_for_review"||row.provider!=="kling"||
  row.source_start_ms!==review.sourceStartMs||row.source_end_ms!==review.sourceEndMs)
  throw new Error("Held attempt or exact source speech window changed.");
const picture=inside(join("assets",row.result_asset_path),"assets");
if(hash(picture)!==review.outputSha256)throw new Error("Reviewed picture bytes changed.");
const donor=editionSpeakingDonorKeyframe(db,root,projectId,review.shotId);
if(!donor||donor.sha256!==review.donorFrameSha256)throw new Error("Approved original speaker frame changed.");
const sidecar=JSON.parse(readFileSync(`${picture}.json`,"utf8")) as {
  requestId:string;image:{sha256:string};audio:{submittedSha256:string;submittedPath:string};
};
if(sidecar.requestId!==review.requestId||sidecar.image.sha256!==review.donorFrameSha256||
  sidecar.audio.submittedSha256!==review.submittedAudioSha256||
  hash(inside(join("assets",sidecar.audio.submittedPath),"assets"))!==review.submittedAudioSha256)
  throw new Error("Retained Avatar request image or submitted voice changed.");
const durationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","stream=duration","-select_streams","v:0","-of","csv=p=0",picture],{encoding:"utf8"}).trim())*1000);
const deficitMs=review.sourceEndMs-review.sourceStartMs-durationMs;
if(deficitMs>0&&(deficitMs>34||review.pictureTailPadMs!==deficitMs||
  !review.pictureEvidence.includes("assembly tail pad")))
  throw new Error("A short picture requires an explicitly reviewed, at-most-one-frame assembly tail pad.");
if(deficitMs<=0&&review.pictureTailPadMs!==undefined)
  throw new Error("No assembly tail pad is needed for this candidate.");
const selected=acceptLipSyncCandidate(db,projectId,review.attemptId,{reviewer:"Codex editorial QC",evidence:
  `${review.pictureEvidence} ${review.audioEvidence} Contact ${review.contactPath}. Retained review SHA256 ${createHash("sha256").update(reviewBytes).digest("hex")}.`});
console.log(JSON.stringify({attemptId:review.attemptId,selected,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
