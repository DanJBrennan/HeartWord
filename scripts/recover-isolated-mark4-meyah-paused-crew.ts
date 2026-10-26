/** Preserve the partial paid crew run stopped after an approved-map mismatch. */
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Wrong data root");
process.env.HEARTWORD_DATA_DIR=root;
const [{getDb},{recoverInterruptedCrew}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-store.js")]);
const db=getDb(),projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",runId="cb3359cb-fdbd-44c9-9273-a66794bda1da";
const run=db.prepare("SELECT id,status,worker_pid FROM production_runs WHERE id=? AND project_id=? AND phase='planning'")
  .get(runId,projectId) as {id:string;status:string;worker_pid:number}|undefined;
if(!run||run.worker_pid!==305388)throw new Error("Unexpected crew worker or project");
if(run.status==="running")recoverInterruptedCrew(db,projectId,runId);
const after=db.prepare("SELECT status,result_json FROM production_runs WHERE id=?").get(runId) as {status:string;result_json:string};
if(after.status!=="incomplete")throw new Error("Partial run was not retained as incomplete");
console.log(JSON.stringify({runId,status:after.status,calls:JSON.parse(after.result_json).calls,
  reason:"Stopped after a read-only comparison found saved target-shot order mismatched Dan's approved detailed picture proposal; no further crew or media requests until reconciled.",
  liveDatabaseOpened:false},null,2));
