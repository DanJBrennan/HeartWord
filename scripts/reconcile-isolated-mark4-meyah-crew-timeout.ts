/** Record the first corrected-crew timeout as an unknown, reserved charge. */
import { DatabaseSync } from "node:sqlite";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileAvatarBudget, checkFilmSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";
const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Wrong isolated data root");
const db=new DatabaseSync(join(root,"db","heartword.sqlite"));
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",runId="635718ea-884a-4e8c-afd2-f76d23c2ebd2";
try{
  const run=db.prepare("SELECT status FROM production_runs WHERE id=? AND project_id=?").get(runId,projectId) as {status:string}|undefined;
  const event=db.prepare("SELECT error,cost_usd FROM production_events WHERE run_id=? AND role='creative_director' AND round=1 ORDER BY sequence LIMIT 1")
    .get(runId) as {error:string|null;cost_usd:number|null}|undefined;
  const reservation=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_crew_spend' AND json_extract(payload,'$.eventId')=?")
    .get(projectId,`${runId}:creative_director:1`) as {payload:string}|undefined;
  if(run?.status!=="incomplete"||event?.cost_usd!==null||!event?.error?.includes("aborted due to timeout")||
      !reservation||JSON.parse(reservation.payload).upperBoundUsd!==2)throw Error("The exact timed-out call or its $2 reservation changed");
  const latest=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reconcile_avatar_budget' ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  if(!latest||JSON.parse(latest.payload).input.unreportedUpperBoundUsd!==10)throw Error("Prior voice liability changed");
  reconcileAvatarBudget(db,{projectId,actor:"Codex",idempotencyKey:"meyah-mark4-corrected-crew-timeout-20261026",
    unreportedUpperBoundUsd:10,outstandingUpperBoundUsd:0,
    evidence:`Retain the earlier USD 10 upper bound for unreported ElevenLabs subscription allocation. The corrected source-clock crew run ${runId} timed out on its first Gemini creative_director call without response usage. Its USD 2 reservation remains unsettled and is included by checkFilmSpend as outstanding, not assumed free or charged twice. The earlier incomplete crew also retains one USD 2 unsettled reservation. No provider invoice is inferred. Dan authorized the standard whole-chapter crew; this reconciliation permits one bounded continuation inside the USD 200 film ceiling.`});
  const budget=checkFilmSpend(db,projectId,2);
  console.log(JSON.stringify({runId,status:"unknown_timeout_cost_reconciled",pendingReservationsRetained:true,
    currentFilmCommittedUsd:budget.committedUsd,afterNextCallUsd:budget.afterComparisonUsd,
    liveDatabaseOpened:false},null,2));
}finally{db.close();}
