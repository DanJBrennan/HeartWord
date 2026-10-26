/** Run the existing complete chapter planning crew, as Dan selected. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("The full Meyah crew must run inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD="2";
if(!process.env.GEMINI_API_KEY)throw new Error("Gemini crew review is unavailable; no paid request was made");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [{getDb},{loadCrewBrief},{runProductionCrew},{checkFilmSpend},{readLanguageEditionPlan}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-context.js"),
  import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/pipeline/voice-lipsync/performance-direction.js"),import("../src/pipeline/language-edition.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(!plan?.revision||plan.revision.reviewer!=="Dan")throw new Error("The producer-approved target correspondence is missing");
const approvedAudio=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='approve_edition_cast_audio' AND undone=0")
  .get(projectId) as {payload:string}|undefined;
if(!approvedAudio||JSON.parse(approvedAudio.payload).planHash!==plan.hash)
  throw new Error("The producer-approved target cast audio is missing or stale");
const brief=loadCrewBrief(db,root,projectId,"planning");
if(brief.shots.length!==145||brief.audio.length!==54)throw new Error("The whole-chapter crew brief changed");
const existing=db.prepare("SELECT id,status,result_json FROM production_runs WHERE project_id=? AND phase='planning' ORDER BY created_at DESC,rowid DESC LIMIT 1")
  .get(projectId) as {id:string;status:string;result_json:string|null}|undefined;
if(existing){
  console.log(JSON.stringify({projectId,runId:existing.id,status:existing.status,
    summary:existing.result_json?JSON.parse(existing.result_json).summary:null,
    action:"Existing planning run retained; inspect before any repeat."},null,2));
  process.exit(0);
}
checkFilmSpend(db,projectId,2);
const dbPath=join(root,"db","heartword.sqlite"),backup=join(root,"review","pre-standard-crew-20261025.sqlite");
if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
console.log(`Running the existing planning crew against all ${brief.shots.length} reviewed Meyah shots; each Gemini call has a conservative USD 2 reservation.`);
const result=await runProductionCrew(projectId,"planning",{db,dataDir:root,maxCalls:30});
const ledger=Number((db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS n FROM cost_ledger_entries WHERE project_id=?").get(projectId) as {n:number}).n);
const report={kind:"isolated_meyah_mark4_standard_whole_chapter_crew",projectId,runId:result.runId,
  status:result.status,summary:result.summary,calls:result.calls,reviewedShots:brief.shots.length,
  productionRecordStatus:result.productionRecord?.status??null,
  openBlockingObjections:result.productionRecord?.objections.filter(item=>item.status==="open"&&item.severity==="blocking").length??null,
  recordedModelSpendUsd:ledger,callUpperBoundUsd:2,
  response:"Retained for producer/Goal Guardian review before new keyframes or LTX video",
  liveDatabaseOpened:false};
writeFileSync(join(root,"review","meyah-mark4-standard-crew-result.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
