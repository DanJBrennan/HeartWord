/** Submit one source-bound Meyah Avatar candidate in the isolated chapter. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { runVoiceLipSync } from "../src/pipeline/voice-lipsync/index.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=join(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah chapter may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId=process.argv[2];
if(!shotId)throw new Error("Usage: run-isolated-mark4-meyah-single-face-sync <shot-id|--remaining>");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Approved picture plan changed.");
const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
  {items:Array<{targetShotId:string;treatment:string}>};
const approved=worklist.items.filter(item=>item.treatment==="replace_avatar").map(item=>item.targetShotId);
const castCount=db.prepare(`SELECT sh.needs_lip_sync,COUNT(sc.character_id) cast_count
  FROM shots sh LEFT JOIN shot_characters sc ON sc.shot_id=sh.id WHERE sh.id=? GROUP BY sh.id`);
const prior=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'");
const eligible=(id:string)=>{
  const row=castCount.get(id) as {needs_lip_sync:number;cast_count:number}|undefined;
  return row?.needs_lip_sync===1&&row.cast_count===1&&!prior.get(id);
};
const scope=shotId==="--remaining"?approved.filter(eligible):[shotId];
if(shotId!=="--remaining"&&(!approved.includes(shotId)||!eligible(shotId)))
  throw new Error("Shot is outside the approved one-face plan or has a retained candidate.");
if(!scope.length)throw new Error("No approved one-face shot remains without a candidate.");
console.log(JSON.stringify({scope,scopeCount:scope.length,result:await runVoiceLipSync(projectId,scope)},null,2));
