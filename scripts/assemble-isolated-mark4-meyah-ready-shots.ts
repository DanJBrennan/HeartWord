/** Assemble selected Meyah shot clips without touching the donor or live project. */
import "dotenv/config";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Assembly is limited to the isolated Meyah worktree.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved Meyah shot correspondence changed.");
const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
  {projectId:string;items:Array<{placement:number;targetShotId:string;treatment:string}>};
if(worklist.projectId!==projectId)throw new Error("The media worklist belongs to another project.");
const selected=db.prepare(`SELECT c.id,ga.id attempt_id,ga.operation,ga.created_at
  FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
  JOIN shots sh ON sh.id=c.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  WHERE c.shot_id=? AND sc.project_id=? AND ga.status='accepted'
    AND ga.operation IN ('generate_final_video','lip_sync')
  ORDER BY ga.created_at DESC,ga.id DESC LIMIT 1`);
const assembled=db.prepare(`SELECT ga.id,ga.created_at FROM generation_attempts ga
  WHERE ga.shot_id=? AND ga.operation='assemble_shot' AND ga.status='accepted'
  ORDER BY ga.created_at DESC,ga.id DESC LIMIT 1`);
const logPath=join(root,"review","meyah-mark4-assembled-ready-shots-20261027.jsonl");
let completed=0,skipped=0;
for(const item of worklist.items){
  if(!["needs_coverage","replace_avatar"].includes(item.treatment))continue;
  const raw=selected.get(item.targetShotId,projectId) as {id:string;attempt_id:string;operation:string;created_at:number}|undefined;
  if(!raw)continue;
  const prior=assembled.get(item.targetShotId) as {id:string;created_at:number}|undefined;
  if(prior&&prior.created_at>=raw.created_at){skipped++;continue;}
  const result=assembleSingleShot(db,item.targetShotId);
  appendFileSync(logPath,JSON.stringify({at:new Date().toISOString(),placement:item.placement,shotId:item.targetShotId,
    rawAttemptId:raw.attempt_id,assembled:result})+"\n");
  completed++;
  console.log(JSON.stringify({placement:item.placement,shotId:item.targetShotId,assembled:result.assembledVideoPath}));
}
console.log(JSON.stringify({projectId,completed,skipped}));
