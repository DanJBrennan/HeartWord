/** Retain the actual Kling face thumbnails for one held ensemble base. */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be read.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId=process.argv[2];
if(!shotId||!/^[a-f0-9-]{36}$/.test(shotId))throw new Error("Usage: prepare-isolated-mark4-meyah-ensemble-faces <target-shot-id>");
const pendingPath=join(root,"review",`meyah-mark4-face-base-pending-${shotId}.json`);
const outDir=join(root,"review",`meyah-mark4-face-review-${shotId}`),manifestPath=join(outDir,"manifest.json");
if(!existsSync(pendingPath)||existsSync(manifestPath))throw new Error("A retained completed base and unused face manifest are required.");
const pending=JSON.parse(readFileSync(pendingPath,"utf8")) as {status:string;taskId:string;preview:{keyframeSha256:string;audio:{sha256:string};durationMs:number}};
if(pending.status!=="base_candidate_recorded"||!pending.taskId)throw new Error("Kling base task is still pending; do not guess a face ID.");
const db=getDb();
const base=db.prepare(`SELECT ga.id,ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  WHERE ga.shot_id=? AND sc.project_id=? AND ga.operation='avatar_base' AND ga.provider='kling' AND ga.status='hold_for_review' ORDER BY ga.created_at DESC LIMIT 1`)
  .get(shotId,projectId) as {id:string;result_asset_path:string}|undefined;
if(!base)throw new Error("The exact held Kling base is unavailable.");
const video=join(root,"assets",base.result_asset_path),sidecar=`${video}.json`;
if(!existsSync(video)||!existsSync(sidecar))throw new Error("The base video or retained provenance is missing.");
const provenance=JSON.parse(readFileSync(sidecar,"utf8")) as {taskId:string;videoUrl:string;outputSha256:string;outputDurationMs:number;shotId:string;keyframeSha256:string;audio:{sha256:string}};
const videoSha256=createHash("sha256").update(readFileSync(video)).digest("hex");
if(provenance.shotId!==shotId||provenance.taskId!==pending.taskId||provenance.outputSha256!==videoSha256||
  provenance.outputDurationMs<pending.preview.durationMs||provenance.keyframeSha256!==pending.preview.keyframeSha256||
  provenance.audio.sha256!==pending.preview.audio.sha256)throw new Error("Kling base bytes, cast audio or required source coverage changed.");
const faces=await new KlingFaceLipSyncProvider().identifyFaces(provenance.videoUrl);
if(!faces.length)throw new Error("Kling found no face; hold the base for picture redesign.");
mkdirSync(outDir,{recursive:true});
const retained=[];
for(const [index,face] of faces.entries()){
  const response=await fetch(face.thumbnailUrl);
  if(!response.ok)throw new Error(`Could not retain face ${index+1}; do not select an ID without its thumbnail.`);
  const bytes=Buffer.from(await response.arrayBuffer()),path=join(outDir,`face-${index+1}.jpg`);
  writeFileSync(path,bytes,{flag:"wx"});
  retained.push({candidate:index+1,faceId:face.faceId,startTime:face.startTime,endTime:face.endTime,
    thumbnailPath:relative(root,path).replaceAll("\\","/"),thumbnailSha256:createHash("sha256").update(bytes).digest("hex")});
}
const manifest={kind:"isolated_meyah_mark4_ensemble_face_review",projectId,shotId,baseAttemptId:base.id,taskId:pending.taskId,
  videoSha256,videoPath:base.result_asset_path,faceCandidates:retained,selectedFaceId:null,
  reviewStatus:"awaiting_visual_identification",noLipSyncSubmitted:true};
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({manifestPath,faceCandidates:retained},null,2));
