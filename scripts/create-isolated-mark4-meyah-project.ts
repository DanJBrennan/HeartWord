/** Create only the isolated, source-unreviewed Mark 4 → Meyah workspace. */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createLanguageEdition, preflightLanguageEdition } from "../src/pipeline/language-edition.js";

if(process.argv.slice(2).join(" ")!=="--apply")throw new Error("Use exactly --apply after inspecting the isolated preflight.");
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=resolve(checkout,"output","mark4-donor-20261024");
const dbPath=resolve(root,"db","heartword.sqlite");
if(realpathSync(root)!==root || realpathSync(dbPath)!==dbPath)throw new Error("Expected ordinary paths under the isolated checkout.");
const donorId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const input={renderId:"deefa536-62f9-41b3-bbac-e9e8fb244206",targetLanguage:"meyah",
  title:{bookChapter:"Markus 4",languageName:"Meyah",authority:"Dan Brennan, 2026-10-25",
    durationMs:4000,profile:"mark4-serif-over-establishing" as const,
    backgroundFramePath:"generated/editorial/mark4-intro/establishing-r1.png"}};
const db=new DatabaseSync(dbPath);
try{
  const preflight=preflightLanguageEdition(db,root,donorId,input);
  if(preflight.status!=="ready" || !preflight.fingerprint)throw new Error(`Isolated preflight held: ${preflight.holds.join(" ")}`);
  const saved=createLanguageEdition(db,root,donorId,{...input,requestId:"mark4-meyah-isolated-pilot-20261025",checkedFingerprint:preflight.fingerprint});
  const stageRows=(db.prepare("SELECT COUNT(*) AS count FROM stage_executions WHERE project_id=?").get(saved.project.id) as {count:number}).count;
  console.log(JSON.stringify({projectId:saved.project.id,created:saved.created,donorRenderId:input.renderId,
    preflightFingerprint:preflight.fingerprint,sourceQuestions:preflight.sourceQuestions,
    targetHasNoStageCompletions:stageRows===0,providerCalls:0},null,2));
}finally{db.close();}
