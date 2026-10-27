/** Read-only, metered picture checks for two new 4:11 Jesus insert candidates. */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCanonicalLikeness } from "../src/pipeline/qc/canonical-likeness.js";
import { checkSceneFidelity } from "../src/pipeline/qc/scene-fidelity.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..","output","mark4-donor-20261024");
if(root.toLowerCase().includes("heartworddata"))throw new Error("Only isolated candidate images may be checked.");
const assets=join(root,"assets"),review=join(root,"review");
const face=join(assets,"characters","jesus","lip_sync_closeup","close-up-neutral-v3.png");
const wardrobe=join(assets,"characters","jesus","motion","motion-teaching-v3.png");
const candidates=[
  {placement:31,shotId:"39ca3a27-baad-4056-a04d-1a5c0a64e453",file:"shot031-v1.png",
    action:"First medium-close insert of Jesus teaching his small inner circle at Mark 4:11, with listeners attentive and no new event."},
  {placement:32,shotId:"e06c1d72-d485-4391-831c-62db9c100a26",file:"shot032-v1.png",
    action:"Distinct three-quarter medium-close insert of Jesus continuing the same Mark 4:11 explanation to his seated listeners."}
];
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const images=candidates.map(item=>({...item,path:join(review,"meyah-mark4-jesus-v11-keyframe-candidates",item.file)}));
const results=await Promise.allSettled(images.map(async item=>{
  const [likeness,scene]=await Promise.all([
    checkCanonicalLikeness("Jesus",face,item.path,wardrobe),
    checkSceneFidelity(item.path,item.action,"sparse",
      "Same lakeshore, olive trees, afternoon light and approved Papuan cast as the wide Mark 4:11 scene. Jesus has the same cream robe and blue trim. This insert must be a distinct closer camera view with his face unobstructed for later lip-sync.")
  ]);
  return {placement:item.placement,shotId:item.shotId,imagePath:item.path,imageSha256:hash(item.path),likeness,scene,
    costUsd:(likeness.costUsd??0)+(scene.costUsd??0)};
}));
const report={kind:"isolated_meyah_mark4_jesus_v11_candidate_picture_checks",projectId:"a5a40890-8bb0-4856-aacb-1dcad97074bb",
  referenceSha256:{face:hash(face),wardrobe:hash(wardrobe)},checks:results.map((result,index)=>result.status==="fulfilled"
    ?{status:"complete",...result.value}:{status:"error",placement:images[index]!.placement,error:String(result.reason)}),
  databaseWrites:0,videoRequests:0,liveDatabaseOpened:false};
const output=join(review,"meyah-mark4-jesus-v11-candidate-picture-checks-20261027.json");
writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,checks:report.checks},null,2));
