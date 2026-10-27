/** Select the reviewed face-targeted Peter 4:38 take in the isolated edition. */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { acceptLipSyncCandidate } from "../src/pipeline/voice-lipsync/candidate-selection.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah project may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="5b3d1b76-e839-45c6-8067-676a5002d623";
const attemptId="4f69296f-7b8c-476f-b276-e6f1b9f3449b";
const outputRel="generated\\lipsync-face\\943914559809665778.mp4";
const expectedSha="adff513613436eb14d8755c3d3fa3147ee57ec33ad2b98f6e6aef8a1b5db14f2";
const backup=join(root,"review","heartword.before-peter-v38-sync-selection-20261027.sqlite");
const contact=join(root,"review","meyah-mark4-peter-v38-sync-contact-20261027","contact.jpg");
if(!existsSync(backup)||!existsSync(contact))throw new Error("The isolated preselection backup and viewed contact are required.");
const output=join(root,"assets",outputRel);
if(!existsSync(output)||createHash("sha256").update(readFileSync(output)).digest("hex")!==expectedSha)throw new Error("The exact reviewed Kling take changed.");
const evidence=JSON.parse(readFileSync(`${output}.json`,"utf8")) as {shotId:string;outputSha256:string;durationMs:number;selectedFaceId:string;sourceStartMs:number;sourceEndMs:number;audio:{sha256:string}};
if(evidence.shotId!==shotId||evidence.outputSha256!==expectedSha||evidence.durationMs!==9967||evidence.selectedFaceId!=="0"||
  evidence.sourceStartMs!==746695||evidence.sourceEndMs!==754976||evidence.audio.sha256!=="f2f0894caebfc577b1716b31c6b69b2af9479f4b0aff0ee5ffda4d6fae2a84a6")
  throw new Error("The reviewed picture, face, source, or cast-audio evidence changed.");
const db=getDb();
const attempt=db.prepare("SELECT shot_id,status,result_asset_path FROM generation_attempts WHERE id=? AND operation='lip_sync'")
  .get(attemptId) as {shot_id:string;status:string;result_asset_path:string}|undefined;
if(!attempt||attempt.shot_id!==shotId||attempt.result_asset_path!==outputRel||attempt.status!=="hold_for_review")
  throw new Error("The exact held Peter attempt is no longer available for first selection.");
const selected=acceptLipSyncCandidate(db,projectId,attemptId,{reviewer:"Codex editorial QC",evidence:
  "Dan delegated routine visual selections. Inspected 0-8.281 s of the 9.967 s take at one-second intervals against the approved Peter/Jesus keyframe: Peter remains wet and alarmed, reaches toward Jesus, with visible changing mouth shapes; Jesus stays asleep with closed eyes; no new face or cut. Kling identify-faces thumbnails show selected face 0 is Peter and face 1 is Jesus. Compared the decoded 8.266 s cast track with the approved Meyah Peter audio at 8 kHz: best lag 0 ms, normalized correlation 0.99931. Selected clip is limited to the exact 8.281 s source-bound window; the source audio and scene map are unchanged. Contact: review/meyah-mark4-peter-v38-sync-contact-20261027/contact.jpg."});
console.log(JSON.stringify({attemptId,selected,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
