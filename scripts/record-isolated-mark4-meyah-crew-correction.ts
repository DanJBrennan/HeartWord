/** Carry Dan's already reviewed source/keyframe decisions into a fresh crew brief. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Crew correction must stay inside the isolated worktree");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const heldRunId="0a52e4dd-b723-4e1a-94bf-41e0ecaae65f";
const dbPath=join(root,"db","heartword.sqlite"),db=new DatabaseSync(dbPath);
try{
  const run=db.prepare("SELECT status,brief_json FROM production_runs WHERE id=? AND project_id=? AND phase='planning'")
    .get(heldRunId,projectId) as {status:string;brief_json:string}|undefined;
  if(run?.status!=="held")throw new Error("The exact held whole-chapter review is missing");
  const source=db.prepare("SELECT start_ms,end_ms,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' AND verse_ref='Mark 4:39'")
    .all(projectId) as Array<{start_ms:number;end_ms:number;speaker_character_id:string|null}>;
  if(source.length!==1||source[0]!.start_ms!==755248||source[0]!.end_ms!==776241||source[0]!.speaker_character_id!==null)
    throw new Error("Dan's narrator-only 4:39 source binding changed");
  const silentShotId="a1d76b69-221c-4705-b0d9-261347f6103d";
  const shot=db.prepare("SELECT action,needs_lip_sync,dialogue_character_id FROM shots WHERE id=?").get(silentShotId) as
    {action:string;needs_lip_sync:number;dialogue_character_id:string|null}|undefined;
  if(!shot||shot.needs_lip_sync!==0||shot.dialogue_character_id!==null||!shot.action.includes("mouth is not visibly speaking"))
    throw new Error("The approved silent 4:39 shot changed");
  const keyframes=[
    {target:"1067c6bc-580d-4f85-91c8-11b5141f3200",donor:"67a2d802-6a79-4461-bd99-aca44b3b7622",verse:"4:9"},
    {target:"760f98b1-45cf-458d-834f-b87a5eb0abf2",donor:"740eb1df-5b4b-4c69-958c-f6bb8032cc39",verse:"4:13"},
  ].map(item=>{
    const row=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
      .get(item.donor) as {result_asset_path:string}|undefined;
    if(!row)throw new Error(`The selected donor keyframe for ${item.verse} is missing`);
    const path=row.result_asset_path.replaceAll("\\","/"),absolute=join(root,"assets",...path.split("/"));
    if(!existsSync(absolute))throw new Error(`The selected donor keyframe for ${item.verse} is absent on disk`);
    return {...item,path,sha256:createHash("sha256").update(readFileSync(absolute)).digest("hex")};
  });
  const peter="5b3d1b76-e839-45c6-8067-676a5002d623";
  if(!db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted'").get(peter))
    throw new Error("Dan's approved Peter 4:38 version-3 target image is missing");
  const note=`Producer source and image correction for the next Meyah Mark 4 planning review. Dan confirmed that 4:39 is narrated action in the Meyah recording, with no distinct spoken Jesus words. The original-reading interval 755248–776241 ms has no character speaker, and target shot ${silentShotId} is a silent shot with no visible speaking mouth. The English parallel reference contains a quoted command, but it must not create Meyah speech, voice conversion, Kling Avatar lip-sync, or a speaking-mouth image at 4:39. The contrary 4:39 findings in held crew run ${heldRunId} are retained as historical errors, not producer direction. Dan also instructed HeartWord to use the original Mark 4 Jesus keyframes: the selected, accepted donor images for target 4:9 ${keyframes[0]!.target} and target 4:13 ${keyframes[1]!.target} are present for the edition's reviewed local picture reuse. Inspect their suitability before requesting new coverage; absence of a target copy before stage 4 is not evidence that the images do not exist. Target Peter 4:38 ${peter} already has Dan's accepted version-3 close-up. Those visual decisions do not approve Avatar video or the final film. Preserve the approved 147-row correspondence, all 54 original-reading speaker rows, and the existing budget gates.`;
  const noteId="meyah-mark4-producer-crew-correction-20261025";
  const previous=db.prepare("SELECT note FROM review_notes WHERE id=? AND project_id=?").get(noteId,projectId) as {note:string}|undefined;
  if(previous && previous.note!==note)throw new Error("A different producer correction is already saved");
  if(!previous){
    const backup=join(root,"review","pre-crew-source-correction-20261025.sqlite");
    if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
    db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'human',?,1,?)")
      .run(noteId,projectId,projectId,note,Date.now());
  }
  const report={kind:"isolated_meyah_mark4_crew_source_correction",projectId,heldRunId,noteId,
    sourceVerse:"Mark 4:39",narratorOnly:true,sourceStartMs:755248,sourceEndMs:776241,
    selectedDonorKeyframes:keyframes,peterTargetKeyframeAlreadyAccepted:true,
    reviewerDecisionSource:"Dan's earlier 4:39 narrator-only answer and original-keyframe instruction",
    providerRequests:0,liveDatabaseOpened:false};
  writeFileSync(join(root,"review","meyah-mark4-crew-source-correction.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}finally{db.close();}
