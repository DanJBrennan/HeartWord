/** Read-only metered likeness and scene checks for the 4:9 speaking still. */
import "dotenv/config";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {checkCanonicalLikeness} from "../src/pipeline/qc/canonical-likeness.js";
import {checkSceneFidelity} from "../src/pipeline/qc/scene-fidelity.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..","output","mark4-donor-20261024");
if(root.toLowerCase().includes("heartworddata"))throw new Error("Only isolated candidate images may be checked.");
const assets=join(root,"assets"),review=join(root,"review");
const version=process.argv[2]??"v1";
if(!/^v[1-9][0-9]*$/.test(version))throw new Error("Use a numbered isolated image candidate.");
const candidate=join(review,"meyah-mark4-shot023-keyframe-candidates",`shot023-${version}.png`);
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const people=[
  {name:"Jesus",face:"jesus/lip_sync_closeup/close-up-neutral-v3.png",wardrobe:"jesus/motion/motion-teaching-v3.png"},
  {name:"Peter",face:"peter/lip_sync_closeup/close-up-neutral-v3.png",wardrobe:"peter/motion/motion-seated-listening-v2.png"},
  {name:"John son of Zebedee",face:"john-son-of-zebedee/motion/motion-neutral-standing-v5-meyah-candidate.png",wardrobe:"john-son-of-zebedee/motion/motion-neutral-standing-v5-meyah-candidate.png"},
  {name:"Crowd witness (elder, grey beard)",face:"crowd-elder-grey-beard/body_pose/motion-neutral-standing-v1.png",wardrobe:"crowd-elder-grey-beard/body_pose/motion-neutral-standing-v1.png"},
  {name:"Crowd witness (young man)",face:"crowd-young-man/body_pose/motion-neutral-standing-v2.png",wardrobe:"crowd-young-man/body_pose/motion-neutral-standing-v2.png"},
];
const checked=await Promise.allSettled(people.map(async person=>{
  const face=join(assets,"characters",person.face),wardrobe=join(assets,"characters",person.wardrobe);
  const result=await checkCanonicalLikeness(person.name,face,candidate,wardrobe);
  return {name:person.name,faceSha256:hash(face),wardrobeSha256:hash(wardrobe),result};
}));
const scene=await checkSceneFidelity(candidate,
  "Jesus concludes his recorded Mark 4:9 call from the wooden boat; Peter, clean-shaven John, the white-bearded elder witness and the younger witness listen silently on the shore.",
  "A few identifiable near listeners plus the existing farther shore crowd",
  "Match the approved boat, rocky Galilean shore, stone village, daylight and five named Papuan characters. Jesus alone has a readable speaking face. No invented action.");
const report={kind:"isolated_meyah_mark4_shot023_candidate_picture_checks",projectId:"a5a40890-8bb0-4856-aacb-1dcad97074bb",
  shotId:"ab57063e-c0f5-46d1-bf16-7f2f415598e6",candidatePath:`review/meyah-mark4-shot023-keyframe-candidates/shot023-${version}.png`,
  candidateSha256:hash(candidate),checks:checked.map((entry,index)=>entry.status==="fulfilled"
    ?{status:"complete",...entry.value}:{status:"error",name:people[index]!.name,error:String(entry.reason)}),
  scene,costUsd:checked.reduce((sum,entry)=>sum+(entry.status==="fulfilled"?(entry.value.result.costUsd??0):0),0)+(scene.costUsd??0),
  databaseWrites:0,videoRequests:0,liveDatabaseOpened:false};
const output=join(review,`meyah-mark4-shot023-${version}-picture-checks-20261027.json`);
writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,checks:report.checks,scene:report.scene,costUsd:report.costUsd},null,2));
