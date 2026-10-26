/** Preserve an uncertain corrected-crew call as a reserved, unreported cost. */
import { DatabaseSync } from "node:sqlite";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileAvatarBudget, checkFilmSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";
const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Wrong isolated data root");
const db=new DatabaseSync(join(root,"db","heartword.sqlite"));
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",runId="635718ea-884a-4e8c-afd2-f76d23c2ebd2";
const roles={"--creative-director":"creative_director","--choreographer":"choreographer","--fidelity-challenger":"fidelity_challenger"} as const;
const flag=process.argv[2] as keyof typeof roles | undefined;
if(!flag||!roles[flag]||process.argv.length!==3)throw Error("Usage: reconcile-isolated-mark4-meyah-crew-uncertain-cost.ts <--creative-director|--choreographer|--fidelity-challenger>");
const role=roles[flag];
try{
  const run=db.prepare("SELECT status FROM production_runs WHERE id=? AND project_id=?").get(runId,projectId) as {status:string}|undefined;
  const event=db.prepare("SELECT error,cost_usd FROM production_events WHERE run_id=? AND role=? AND round=1 ORDER BY sequence LIMIT 1")
    .get(runId,role) as {error:string|null;cost_usd:number|null}|undefined;
  const reservation=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_crew_spend' AND json_extract(payload,'$.eventId')=?")
    .get(projectId,`${runId}:${role}:1`) as {payload:string}|undefined;
  const expectedFailure=role==="fidelity_challenger"?"input token count exceeds the maximum":"aborted due to timeout";
  if(run?.status!=="incomplete"||event?.cost_usd!==null||!event?.error?.includes(expectedFailure)||
      !reservation||JSON.parse(reservation.payload).upperBoundUsd!==2)throw Error("The exact timed-out call or its $2 reservation changed");
  const latest=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reconcile_avatar_budget' ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  if(!latest||JSON.parse(latest.payload).input.unreportedUpperBoundUsd!==10)throw Error("Prior voice liability changed");
  const firstEvidence=`Retain the earlier USD 10 upper bound for unreported ElevenLabs subscription allocation. The corrected source-clock crew run ${runId} timed out on its first Gemini creative_director call without response usage. Its USD 2 reservation remains unsettled and is included by checkFilmSpend as outstanding, not assumed free or charged twice. The earlier incomplete crew also retains one USD 2 unsettled reservation. No provider invoice is inferred. Dan authorized the standard whole-chapter crew; this reconciliation permits one bounded continuation inside the USD 200 film ceiling.`;
  const laterEvidence=`Retain the earlier USD 10 upper bound for unreported ElevenLabs subscription allocation. The corrected source-clock crew run ${runId} ${role==="fidelity_challenger"?"received an HTTP 400 input-token-limit rejection on":"timed out on"} a Gemini ${role} call without response usage. Its USD 2 reservation remains unsettled and is included by checkFilmSpend as outstanding, not assumed free or charged twice. Earlier timed-out and incomplete crew reservations also remain outstanding. No provider invoice is inferred. Dan authorized the standard whole-chapter crew; this reconciliation permits a bounded continuation inside the USD 200 film ceiling.`;
  reconcileAvatarBudget(db,{projectId,actor:"Codex",idempotencyKey:role==="creative_director"?"meyah-mark4-corrected-crew-timeout-20261026":`meyah-mark4-corrected-crew-${role}-timeout-20261026`,
    unreportedUpperBoundUsd:10,outstandingUpperBoundUsd:0,
    evidence:role==="creative_director"?firstEvidence:laterEvidence});
  const budget=checkFilmSpend(db,projectId,2);
  console.log(JSON.stringify({runId,status:"uncertain_crew_cost_reconciled",pendingReservationsRetained:true,
    currentFilmCommittedUsd:budget.committedUsd,afterNextCallUsd:budget.afterComparisonUsd,
    liveDatabaseOpened:false},null,2));
}finally{db.close();}
