import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { requireCurrentPlan } from "../src/pipeline/creative-direction/crew-store.js";
import { assetPath, sha256 } from "../src/pipeline/media-generation/external-keyframes.js";

// Assistant/Shot Planner tool within media preparation, not a live Pippa worker.
// Input .blend is read only. Output is a candidate for normal set-reference review.
const [shotId,specFile] = process.argv.slice(2);
if (!shotId || !specFile) throw new Error("Usage: npx tsx scripts/set-snapshot.ts <shot-id> <spec.json>; see CODEX_LTX_REFERENCE_WORKFLOW.md");
const db = getDb(), dataDir = getDataDir();
const shot = db.prepare("SELECT sc.project_id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE s.id=?").get(shotId);
if (!shot) throw new Error("Unknown shot");
const plan = requireCurrentPlan(db,dataDir,String(shot.project_id));
const spec = JSON.parse(readFileSync(specFile,"utf8")) as {sourcePath:string;sourceSha256:string;sourceRecordRef:string;reason:string;camera:{positionM:number[];targetM:number[];lensMm:number;sensorWidthMm:number;metersPerBlenderUnit:number}};
if (!spec.sourcePath?.toLowerCase().endsWith(".blend") || !spec.sourceRecordRef?.trim() || !spec.reason?.trim()) throw new Error("A retained .blend, source/version record and purpose are required; unknown geometry cannot be guessed.");
const model = assetPath(dataDir,spec.sourcePath);
if (sha256(readFileSync(model)) !== spec.sourceSha256) throw new Error("Set model hash mismatch");
const output = assetPath(dataDir,`generated/set-snapshots/${randomUUID()}/view.png`);
mkdirSync(dirname(output),{recursive:true});
const request = {...spec,shotId,productionRevision:{runId:plan.id,briefHash:plan.brief_hash},output};
const requestFile = resolve(dirname(output),"request.json");
writeFileSync(requestFile,JSON.stringify(request,null,2),{flag:"wx"});
execFileSync(process.env.BLENDER_PATH ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe",["--background","--disable-autoexec",model,"--python-exit-code","1","--python",resolve("scripts/blender/snapshot_set.py"),"--",requestFile],{stdio:"pipe",windowsHide:true,timeout:300000});
if (requireCurrentPlan(db,dataDir,String(shot.project_id)).id !== plan.id) throw new Error(`Production changed. Retain ${output} as an unselected candidate; prepare a current snapshot.`);
console.log(JSON.stringify({output,provenance:`${output}.json`,status:"candidate",next:"Use the existing media-library registration and target-shot set-reference review; this command grants no canon or generation approval."},null,2));
