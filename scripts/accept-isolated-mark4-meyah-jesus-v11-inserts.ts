/** Attach two independently reviewed 4:11 Jesus images to the isolated edition. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, productionAuthorization, recordMediaAcceptance } from "../src/pipeline/creative-direction/crew-store.js";
import { readLandscapePng } from "../src/pipeline/media-generation/external-keyframes.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024");
const rootRel=relative(checkout,root);
if(rootRel===".."||rootRel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah worktree may be edited.");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
if(process.argv[2]&&process.argv[2]!=="--check")throw new Error("Usage: accept-isolated-mark4-meyah-jesus-v11-inserts [--check]");
const dbPath=join(root,"db","heartword.sqlite"),reviewDir=join(root,"review");
const manifest=JSON.parse(readFileSync(join(reviewDir,"meyah-mark4-jesus-v11-keyframe-candidate-manifest-20261027.json"),"utf8")) as {
  projectId:string;planHash:string;items:Array<{placement:number;shotId:string;candidatePath:string;sha256:string;promptSummary:string;
    sourceReferences:Array<{path:string;sha256:string}>}>;
};
const report=JSON.parse(readFileSync(join(reviewDir,"meyah-mark4-jesus-v11-candidate-picture-checks-20261027.json"),"utf8")) as {
  projectId:string;checks:Array<{status:string;placement:number;shotId:string;imageSha256:string;
    likeness:{score:number;instanceCount:number;wardrobeStatus:string;wardrobeNotes:string};
    scene:{settingScore:number;crowdDensityMatch:boolean;actionMatch:boolean;continuityViolation:boolean};costUsd:number}>;
};
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
if(manifest.projectId!==projectId||manifest.planHash!==planHash||report.projectId!==projectId||
  manifest.items.length!==2||report.checks.length!==2||manifest.items.map(x=>x.placement).join()!=="31,32")
  throw new Error("The pinned two-image review packet changed.");
const db=new DatabaseSync(dbPath);
try{
  assertEditionInputsCurrent(db,root,projectId);
  const plan=readLanguageEditionPlan(db,projectId),authorization=productionAuthorization(db,root,projectId);
  if(plan?.hash!==planHash||!plan.revision)throw new Error("Reviewed edition correspondence changed.");
  const materialized=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  const mapped=materialized?JSON.parse(materialized.payload) as {planHash:string;shots:Array<{targetShotId:string|null;treatment:string}>}:null;
  if(mapped?.planHash!==planHash)throw new Error("Materialized target shot order changed.");
  const prepared=manifest.items.map(item=>{
    const check=report.checks.find(x=>x.placement===item.placement&&x.shotId===item.shotId);
    if(!check||check.status!=="complete"||check.imageSha256!==item.sha256||
      check.likeness.score<75||check.likeness.instanceCount!==1||check.scene.settingScore<90||
      !check.scene.crowdDensityMatch||!check.scene.actionMatch||check.scene.continuityViolation)
      throw new Error(`Picture evidence for placement ${item.placement} is incomplete.`);
    // The 31 wardrobe checker wanted a belt and mantle that are below this chest crop.
    // The visible tunic, neckline and blue trim match the approved Jesus reference.
    if(item.placement===32&&check.likeness.wardrobeStatus!=="match")
      throw new Error("The second insert has an unresolved visible wardrobe mismatch.");
    const candidate=resolve(root,item.candidatePath),candidateRel=relative(reviewDir,candidate);
    if(candidateRel===".."||candidateRel.startsWith(`..${sep}`)||sha(candidate)!==item.sha256)
      throw new Error("Candidate image changed or left the isolated review folder.");
    for(const reference of item.sourceReferences){
      const source=resolve(root,reference.path),sourceRel=relative(root,source);
      if(sourceRel===".."||sourceRel.startsWith(`..${sep}`)||sha(source)!==reference.sha256)
        throw new Error("Image generation reference changed.");
    }
    const row=mapped.shots[item.placement-1],reviewed=plan.revision.correspondence[item.placement-1];
    if(row?.targetShotId!==item.shotId||row.treatment!=="replace_avatar"||reviewed?.treatment!=="replace_avatar")
      throw new Error(`Placement ${item.placement} no longer needs a Jesus speaking insert.`);
    const shot=db.prepare("SELECT sh.needs_lip_sync,sh.verse_ref,c.name AS speaker FROM shots sh JOIN characters c ON c.id=sh.dialogue_character_id WHERE sh.id=?")
      .get(item.shotId) as {needs_lip_sync:number;verse_ref:string;speaker:string}|undefined;
    if(shot?.needs_lip_sync!==1||shot.verse_ref?.toLowerCase()!=="mark 4:11"||shot.speaker!=="Jesus")
      throw new Error("Speaker or Scripture binding changed.");
    const existing=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted'")
      .get(item.shotId) as {id:string;result_asset_path:string}|undefined;
    if(existing)throw new Error(`Placement ${item.placement} already has an accepted target keyframe ${existing.id}.`);
    return {...item,check,candidate,dimensions:readLandscapePng(readFileSync(candidate))};
  });
  if(process.argv[2]==="--check"){
    console.log(JSON.stringify({projectId,planHash,placements:prepared.map(item=>({placement:item.placement,
      shotId:item.shotId,sha256:item.sha256,dimensions:item.dimensions,likeness:item.check.likeness.score,
      scene:item.check.scene.settingScore})),databaseWrites:0},null,2));
    process.exit(0);
  }
  const backup=join(reviewDir,"heartword.before-jesus-v11-inserts-20261027.sqlite");
  if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
  const saved=prepared.map(item=>{
    const attemptId=randomUUID(),relativePath=`generated/keyframes/codex/${item.shotId}/meyah-v11-${item.sha256.slice(0,16)}.png`;
    const output=join(root,"assets",...relativePath.split("/"));
    mkdirSync(dirname(output),{recursive:true});
    copyFileSync(item.candidate,output);
    if(sha(output)!==item.sha256)throw new Error("Keyframe copy changed.");
    const sidecar={kind:"isolated_meyah_mark4_jesus_v11_insert",provider:"codex_imagegen",model:"not_reported",
      attemptId,shotId:item.shotId,placement:item.placement,resultPath:relativePath,resultHash:item.sha256,
      dimensions:item.dimensions,promptSummary:item.promptSummary,
      promptProvenance:"The actual built-in tool prompt preceded this registration. This saved summary is not a verbatim prompt or a pre-generation brief.",
      sourceReferences:item.sourceReferences,sourceManifest:"review/meyah-mark4-jesus-v11-keyframe-candidate-manifest-20261027.json",
      pictureChecks:"review/meyah-mark4-jesus-v11-candidate-picture-checks-20261027.json",
      editorialReview:"Codex selected under Dan's delegated routine visual decisions. Placement 31 has no visible belt or lower mantle because of its chest crop; visible cream tunic, blue trim and face match.",
      billing:"Built-in Codex image model and per-call charge were not reported; cost_usd=0 is a schema placeholder, not a free-generation claim.",
      costOfIndependentChecksUsd:item.check.costUsd,status:"accepted"};
    writeFileSync(output.replace(/\.png$/,".json"),JSON.stringify(sidecar,null,2)+"\n",{flag:"wx"});
    return {...item,attemptId,relativePath,output};
  });
  authorization.assertCurrent();
  const now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try{
    for(const item of saved){
      db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
        VALUES (?,?,'codex_imagegen','not_reported','generate',?,?,'accepted',?,0,?)`)
        .run(item.attemptId,item.shotId,`${item.dimensions.width}x${item.dimensions.height}`,
          `[prompt summary, exact built-in prompt not retained] ${item.promptSummary}`,item.relativePath,now);
      bindAttemptRevision(db,projectId,item.attemptId,authorization);
      db.prepare("UPDATE shots SET status='keyframe_approved' WHERE id=?").run(item.shotId);
      db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
        .run(randomUUID(),projectId,item.attemptId,item.check.costUsd,now);
      const reviewNoteId=randomUUID();
      db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
        VALUES (?,?,'shot',?,'qc',?,1,?)`)
        .run(reviewNoteId,projectId,item.shotId,
          `Codex visual selection for Jesus Mark 4:11 placement ${item.placement}: distinct medium-close angle; likeness ${item.check.likeness.score}/100, scene ${item.check.scene.settingScore}/100, one Jesus, no scene violation. Placement 31 checker called the offscreen lower belt/mantle absent; visible costume and face match. Image SHA256 ${item.sha256}. Exact image prompt was not retained; source references and summary are pinned in ${item.relativePath.replace(/\.png$/, ".json")}. This approves the still only.`,now);
      recordMediaAcceptance(db,projectId,item.attemptId,reviewNoteId);
    }
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
  const selection={kind:"isolated_meyah_mark4_jesus_v11_insert_selection",projectId,planHash,
    selections:saved.map(item=>({placement:item.placement,shotId:item.shotId,attemptId:item.attemptId,
      resultPath:item.relativePath,sha256:item.sha256,likeness:item.check.likeness.score,
      scene:item.check.scene.settingScore,checkCostUsd:item.check.costUsd})),
    reviewer:"Codex editorial under Dan's delegated visual choices",producerApprovalClaimed:false,
    newImageGenerationRequests:0,newVideoRequests:0,liveDatabaseOpened:false,quickCheck:db.prepare("PRAGMA quick_check").get()};
  writeFileSync(join(reviewDir,"meyah-mark4-jesus-v11-insert-selection-20261027.json"),JSON.stringify(selection,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(selection,null,2));
}finally{db.close();}
