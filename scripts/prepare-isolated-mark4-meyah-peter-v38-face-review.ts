/** Identify actual Kling face IDs and retain thumbnails before targeted sync. */
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
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="5b3d1b76-e839-45c6-8067-676a5002d623";
const pendingPath=join(root,"review","meyah-mark4-peter-v38-base-pending-20261027.json");
const outDir=join(root,"review","meyah-mark4-peter-v38-face-review-20261027");
const manifestPath=join(outDir,"manifest.json");
if(!existsSync(pendingPath)||existsSync(manifestPath))throw new Error("A completed retained base and unused face manifest are required.");
const pending=JSON.parse(readFileSync(pendingPath,"utf8")) as {status:string;taskId:string};
if(pending.status!=="base_candidate_recorded"||!pending.taskId)throw new Error("Kling base task is still pending; never guess a face ID.");
const db=getDb();
const base=db.prepare(`SELECT ga.id,ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  WHERE ga.shot_id=? AND sc.project_id=? AND ga.operation='avatar_base' AND ga.provider='kling' AND ga.status='hold_for_review' ORDER BY ga.created_at DESC LIMIT 1`)
  .get(shotId,projectId) as {id:string;result_asset_path:string}|undefined;
if(!base)throw new Error("The exact held Kling base is unavailable.");
const file=join(root,"assets",base.result_asset_path),sidecar=`${file}.json`;
if(!existsSync(file)||!existsSync(sidecar))throw new Error("The base video or its retained provenance is missing.");
const provenance=JSON.parse(readFileSync(sidecar,"utf8")) as {taskId:string;videoUrl:string;outputSha256:string;durationMs:number;shotId:string};
const fileHash=createHash("sha256").update(readFileSync(file)).digest("hex");
if(provenance.shotId!==shotId||provenance.taskId!==pending.taskId||provenance.outputSha256!==fileHash||provenance.durationMs<8281)throw new Error("The Kling base bytes or required speaking coverage changed.");
const faces=await new KlingFaceLipSyncProvider().identifyFaces(provenance.videoUrl);
if(!faces.length)throw new Error("Kling found no face; hold the base for picture redesign.");
mkdirSync(outDir,{recursive:true});
const retained=[];
for(const [index,face] of faces.entries()){
  const response=await fetch(face.thumbnailUrl);
  if(!response.ok)throw new Error(`Could not retain face ${index+1}; do not select an ID without its thumbnail.`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const path=join(outDir,`face-${index+1}.jpg`);
  writeFileSync(path,bytes,{flag:"wx"});
  retained.push({candidate:index+1,faceId:face.faceId,startTime:face.startTime,endTime:face.endTime,thumbnailPath:relative(root,path).replaceAll("\\","/"),thumbnailSha256:createHash("sha256").update(bytes).digest("hex")});
}
const manifest={kind:"isolated_meyah_mark4_peter_v38_face_review",projectId,shotId,baseAttemptId:base.id,taskId:pending.taskId,videoSha256:fileHash,videoPath:base.result_asset_path,
  faceCandidates:retained,selectedFaceId:null,reviewStatus:"awaiting_visual_identification",noLipSyncSubmitted:true};
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({manifestPath,faceCandidates:retained},null,2));
