/** Attach Dan's already approved Peter 4:38 image to the isolated target shot.
 * This selects the existing image only; it requests no new image or video.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { readLandscapePng } from "../src/pipeline/media-generation/external-keyframes.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024");
const rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("The edition data root must remain inside this isolated worktree");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const donorShotId="6db6f5f1-ced4-4675-82f4-05c772333d01";
const approvedHash="ee56dec53b628c287956f1737883de4a0da5b06afaa5cdbef56b074af0a607cd";
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const dbPath=join(root,"db","heartword.sqlite");
const candidate=JSON.parse(readFileSync(join(root,"review","peter-v38-keyframe-candidate-v3.json"),"utf8")) as {
  targetProjectId:string;donorShotId:string;canonicalCharacterVersionId:string;
  output:{path:string;sha256:string};producerApproval:{reviewer:string;statement:string;scope:string};prompt:string;
};
if(candidate.targetProjectId!==projectId||candidate.donorShotId!==donorShotId||
  candidate.output.sha256!==approvedHash||candidate.producerApproval.reviewer!=="Dan"||
  candidate.producerApproval.statement!=="Approve version 3")throw new Error("The producer-approved Peter visual changed");
const image=join(root,"assets",...candidate.output.path.split("/"));
const bytes=readFileSync(image),imageHash=sha(bytes),dimensions=readLandscapePng(bytes);
if(imageHash!==approvedHash)throw new Error("The approved Peter image bytes changed");
const provenancePath=image.replace(/\.png$/,".json");
const provenance={kind:"approved_pre_shot_codex_image_handoff",provider:"codex_imagegen",model:"not_reported",
  resultPath:candidate.output.path,resultHash:imageHash,dimensions,status:"accepted",
  originalReceipt:"review/peter-v38-keyframe-candidate-v3.json",reviewer:"Dan",
  statement:candidate.producerApproval.statement,approvalScope:candidate.producerApproval.scope,
  prompt:candidate.prompt,
  billing:"Existing built-in Codex image candidate. Underlying model and per-call billing not reported; cost_usd=0 is a schema compatibility placeholder, not a claim of free generation."};
if(existsSync(provenancePath)){
  const saved=JSON.parse(readFileSync(provenancePath,"utf8")) as typeof provenance;
  if(saved.resultHash!==approvedHash||saved.resultPath!==candidate.output.path||saved.provider!=="codex_imagegen")
    throw new Error("The accepted Peter image provenance conflicts with its approval");
}else writeFileSync(provenancePath,JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});

const db=new DatabaseSync(dbPath);
try{
  assertEditionInputsCurrent(db,root,projectId);
  const plan=readLanguageEditionPlan(db,projectId);
  if(!plan?.revision||plan.revision.reviewer!=="Dan")throw new Error("The reviewed target correspondence is unavailable");
  const row=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  const mapped=row?JSON.parse(row.payload) as {planHash:string;shots:Array<{donorShotId:string;targetShotId:string|null;treatment:string;targetSegmentId:string|null}>}:null;
  if(!mapped||mapped.planHash!==plan.hash)throw new Error("The materialized shot plan changed");
  const matches=mapped.shots.filter(item=>item.donorShotId===donorShotId&&item.treatment==="replace_avatar");
  if(matches.length!==1||!matches[0]?.targetShotId)throw new Error("Peter's target speaking shot is ambiguous");
  const shotId=matches[0].targetShotId;
  const shot=db.prepare("SELECT needs_lip_sync,dialogue_character_id,verse_ref FROM shots WHERE id=?").get(shotId) as
    {needs_lip_sync:number;dialogue_character_id:string;verse_ref:string}|undefined;
  const binding=db.prepare("SELECT source_audio_segment_id,source_start_ms,source_end_ms,character_version_id FROM shot_utterance_bindings WHERE shot_id=?")
    .get(shotId) as {source_audio_segment_id:string;source_start_ms:number;source_end_ms:number;character_version_id:string}|undefined;
  if(shot?.needs_lip_sync!==1||shot.dialogue_character_id!=="9cbc4222-b194-4db4-baa9-2ba7083e31f3"||shot.verse_ref!=="Mark 4:38"||
    binding?.source_audio_segment_id!==matches[0].targetSegmentId||binding.source_start_ms!==746695||binding.source_end_ms!==754976||
    binding.character_version_id!==candidate.canonicalCharacterVersionId)throw new Error("The target Peter shot or source binding changed");
  const existing=db.prepare("SELECT id,status FROM generation_attempts WHERE shot_id=? AND provider='codex_imagegen' AND operation='generate' AND result_asset_path=?")
    .get(shotId,candidate.output.path) as {id:string;status:string}|undefined;
  if(existing){if(existing.status!=="accepted")throw new Error("The Peter keyframe attempt is no longer accepted");}
  else{
    if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted'").get(shotId))
      throw new Error("Another target Peter keyframe is already accepted; review selection first");
    const backup=join(root,"review","pre-target-peter-keyframe-20261025.sqlite");
    if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
    const now=Date.now(),attemptId=randomUUID();
    db.exec("BEGIN IMMEDIATE");
    try{
      db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
        VALUES (?,?,'codex_imagegen','not_reported','generate',?,?,'accepted',?,0,?)`)
        .run(attemptId,shotId,`${dimensions.width}x${dimensions.height}`,candidate.prompt,candidate.output.path,now);
      db.prepare("UPDATE shots SET status='keyframe_approved' WHERE id=?").run(shotId);
      db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
        VALUES (?,?,'shot',?,'human',?,1,?)`)
        .run(randomUUID(),projectId,shotId,`Dan approved Peter 4:38 version 3 for eyeline and close-up composition. Image SHA256 ${approvedHash}. Voice, Kling Avatar video and film remain separately reviewed.`,now);
      const sequence=(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n;
      db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'accept_edition_peter_keyframe',?,?,?)")
        .run(randomUUID(),projectId,sequence,JSON.stringify({attemptId,shotId,donorShotId,path:candidate.output.path,sha256:approvedHash,
          reviewer:"Dan",statement:candidate.producerApproval.statement,scope:candidate.producerApproval.scope,noProviderRequest:true}),
          "meyah-mark4-peter-v38-approved-keyframe",now);
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
  }
  const report={kind:"isolated_meyah_peter_v38_keyframe_selection",projectId,shotId,donorShotId,
    path:candidate.output.path,sha256:approvedHash,approval:"Dan: Approve version 3",
    imageGenerationRequests:0,videoRequests:0,targetAudioChanged:false,donorChanged:false};
  writeFileSync(join(root,"review","meyah-mark4-peter-v38-target-keyframe-selection.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}finally{db.close();}
