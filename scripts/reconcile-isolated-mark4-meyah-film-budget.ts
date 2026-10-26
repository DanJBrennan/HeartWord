/** Reconcile existing Meyah voice use before any paid crew or Avatar request.
 * The read-only ElevenLabs subscription response is evidence, not an invoice.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { checkFilmSpend, reconcileAvatarBudget } from "../src/pipeline/voice-lipsync/performance-direction.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Budget reconciliation must stay inside the isolated worktree");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const usage=JSON.parse(readFileSync(join(root,"review","meyah-mark4-provider-usage-preflight.json"),"utf8")) as {
  projectId:string;elevenLabsSpeechToSpeechRequests:number;reportedCharacterCostUnits:number;
  directVoiceUsd:null;recordedFilmLedgerUsd:number;budgetReconciliationCount:number;
};
if(usage.projectId!==projectId||usage.elevenLabsSpeechToSpeechRequests!==10||usage.reportedCharacterCostUnits!==9490||
  usage.directVoiceUsd!==null||usage.recordedFilmLedgerUsd!==0)
  throw new Error("The existing voice use or target film ledger changed");
const key=process.env.ELEVENLABS_API_KEY;
if(!key)throw new Error("The ElevenLabs subscription status is unavailable");
const response=await fetch("https://api.elevenlabs.io/v1/user/subscription",{headers:{"xi-api-key":key}});
if(!response.ok)throw new Error(`Read-only ElevenLabs subscription query failed: HTTP ${response.status}`);
const raw=await response.json() as {tier?:string;character_count?:number;character_limit?:number;
  current_overage?:{amount?:string;currency?:string};status?:string;currency?:string;billing_period?:string;has_open_invoices?:boolean};
if(raw.tier!=="creator"||raw.status!=="active"||raw.currency!=="usd"||raw.billing_period!=="monthly_period"||
  raw.current_overage?.amount!=="0"||raw.current_overage.currency!=="usd"||raw.has_open_invoices!==false||
  !Number.isInteger(raw.character_count)||!Number.isInteger(raw.character_limit)||
  raw.character_limit!<usage.reportedCharacterCostUnits||raw.character_count!>raw.character_limit!)
  throw new Error("Account status does not support a bounded included-credit voice liability; reconcile manually");
const subscription={kind:"read_only_elevenlabs_subscription_status",checkedAt:new Date().toISOString(),
  apiReference:"https://elevenlabs.io/docs/api-reference/user/subscription/get",
  tier:raw.tier,status:raw.status,currency:raw.currency,billingPeriod:raw.billing_period,
  characterCount:raw.character_count,characterLimit:raw.character_limit,
  currentOverageUsd:raw.current_overage.amount,hasOpenInvoices:raw.has_open_invoices,
  apiKeyRetained:false,invoiceClaim:false};
writeFileSync(join(root,"review","meyah-mark4-elevenlabs-subscription-read-only.json"),JSON.stringify(subscription,null,2)+"\n");

const dbPath=join(root,"db","heartword.sqlite"),db=new DatabaseSync(dbPath);
try{
  const currentLedger=Number((db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS n FROM cost_ledger_entries WHERE project_id=?").get(projectId) as {n:number}).n);
  if(currentLedger!==0)throw new Error("The target film ledger changed after the provider usage audit");
  const backup=join(root,"review","pre-film-budget-reconciliation-20261025.sqlite");
  if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
  const liabilityUsd=10;
  const evidence=`Codex conservative project liability for ten already completed ElevenLabs speech-to-speech requests: provider sidecars report 9,490 character-cost units, but no direct USD charge. Read-only Creator monthly subscription status on ${subscription.checkedAt}: ${subscription.characterCount}/${subscription.characterLimit} credits used, current overage USD 0, no open invoice. Reserve USD ${liabilityUsd} against HeartWord's USD 200 film ceiling for unknown subscription allocation, not as a measured bill. No future crew, Kling, or LTX request is included in this liability.`;
  reconcileAvatarBudget(db,{projectId,actor:"Codex",evidence,unreportedUpperBoundUsd:liabilityUsd,
    outstandingUpperBoundUsd:0,idempotencyKey:"meyah-mark4-voice-liability-20261025"});
  const budget=checkFilmSpend(db,projectId,0);
  const report={kind:"isolated_meyah_mark4_film_budget_reconciliation",projectId,
    voiceRequests:10,reportedCharacterCostUnits:9490,directVoiceUsd:null,
    conservativeUnreportedLiabilityUsd:liabilityUsd,recordedLedgerUsd:currentLedger,
    cumulativeFilmCeilingUsd:200,remainingBeforeFutureSpendUsd:budget.remainingUsd,
    subscriptionEvidence:"review/meyah-mark4-elevenlabs-subscription-read-only.json",
    actor:"Codex",producerApprovedDollarAllocation:false,
    futureRequestsAuthorizedByThisRecord:false,liveDatabaseOpened:false};
  writeFileSync(join(root,"review","meyah-mark4-film-budget-reconciliation.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}finally{db.close();}
