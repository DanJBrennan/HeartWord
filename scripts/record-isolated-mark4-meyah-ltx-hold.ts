/** Make two reconciled Desktop transport failures visible in the target shot. */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Hold note must stay in the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const {getDb}=await import("../src/db/client.js");
const db=getDb(),projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="ae96ed8d-d4e7-457e-b309-3390d2a3b362";
const files=[
  "ae96ed8d-d4e7-457e-b309-3390d2a3b362-draft-aeb71b7f-f9a9-4711-a314-aef60ebe49f9-ltx-d58b59cd-277a-458b-b469-91de12e6ec59.mp4.json",
  "ae96ed8d-d4e7-457e-b309-3390d2a3b362-draft-72c83d5c-16c8-4841-a061-1a4c7f1aaba9-ltx-73d0c6db-24fc-4e29-93c9-88bb10222c7f.mp4.json"];
for(const file of files){const absolute=join(root,"assets","generated","video",file),value=JSON.parse(readFileSync(absolute,"utf8"));
  if(value.status!=="submission_uncertain"||value.error!=="socket hang up"||existsSync(absolute.slice(0,-5)))
    throw new Error("An uncertain LTX draft now has a different outcome; reconcile before recording a hold");}
const draft=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_draft'").get(shotId);
if(draft)throw new Error("A saved draft appeared; inspect it instead of recording this hold");
const marker="Meyah Mark 4 shot 8 local LTX transport hold (two reconciled attempts)";
const prior=db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND note LIKE ?")
  .get(projectId,shotId,`${marker}%`) as {id:string}|undefined;
const note=`${marker}. Both five-second 720p Fast requests ended with socket hang up before inference evidence. Desktop remained healthy and idle with the previous completed progress ID; no new Mac or local MP4 appeared. Each matching remote input/lease was cleared only after idle reconciliation. Metadata is retained under generated/video (${files.join(", ")}). No draft was selected or final video generated. Restart LTX Desktop and retest one bounded preview before this shot resumes.`;
const id=prior?.id??randomUUID();
if(!prior)db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?, 'shot',?,'qc',?,0,?)")
  .run(id,projectId,shotId,note,Date.now());
const receipt={kind:"isolated_meyah_mark4_ltx_draft_hold",projectId,shotId,reviewNoteId:id,created:!prior,metadata:files,liveDatabaseOpened:false};
writeFileSync(join(root,"review","meyah-mark4-shot008-local-ltx-hold.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt,null,2));
