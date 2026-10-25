import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { readLanguageEditionOrigin, readLanguageEditionPlan } from "./language-edition.js";
import { hasCurrentSourceReview } from "./ingestion/source-review.js";
import { parseReferenceOnlyVerseMarkers, parseSourceTextByVerse } from "./ingestion/parse-source-text.js";
import { resolveAndBindSourcePaths } from "./ingestion/source-catalog.js";
import { readConfirmedSpeechRuns } from "./ingestion/continuous-speech.js";
import { parseVerseRange } from "./scene-breakdown/build-scenes.js";
import { buildChapterIntroPlan } from "./casting/chapter-intro.js";
import { mediaDurationMs } from "./assembly/finishing.js";
import { productionAssetPath } from "./creative-direction/crew-context.js";
import { assertEditionInputsCurrent } from "./language-edition.js";
import type { StageResult } from "./types.js";

type RecordRow=Record<string,string|number|null>;
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
function row(db:DatabaseSync,sql:string,...params:Array<string|number>):RecordRow|undefined{return db.prepare(sql).get(...params) as RecordRow|undefined;}
function editionSourceIsCurrent(db:DatabaseSync,dataDir:string,projectId:string): boolean {
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin?.preflight.target.audio||!origin.preflight.target.text||!origin.preflight.target.reference)return false;
  const project=row(db,"SELECT id,language,book,chapter FROM projects WHERE id=?",projectId)!;
  const paths=resolveAndBindSourcePaths(db,project as {id:string;language:string;book:string;chapter:number},dataDir);
  const inputs=[paths.audioPath,paths.docxPath,paths.referencePath];
  return inputs.every((path,index)=>digest(readFileSync(path))===[origin.preflight.target.audio!,origin.preflight.target.text!,origin.preflight.target.reference!][index]!.sha256);
}
function command(db:DatabaseSync,projectId:string,type:string):{payload:string}|undefined{
  return db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type=? AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId,type) as {payload:string}|undefined;
}
function appendCommand(db:DatabaseSync,projectId:string,type:string,payload:unknown,now:number){
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(),projectId,sequence,type,JSON.stringify(payload),`language-edition:${projectId}:${type}`,now);
}

/** Stage 2 keeps the approved narrative divisions, after target source review. */
export function materializeEditionScenes(db:DatabaseSync,dataDir:string,projectId:string):StageResult {
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)return {ok:false,reasoning:"This is not a language edition."};
  try{assertEditionInputsCurrent(db,dataDir,projectId);}catch(error){return {ok:false,reasoning:`Edition inputs changed: ${(error as Error).message}`};}
  try{if(!editionSourceIsCurrent(db,dataDir,projectId))return {ok:false,reasoning:"Target source bytes changed since edition creation."};}
  catch(error){return {ok:false,reasoning:`Target source is unavailable: ${(error as Error).message}`};}
  try{if(!hasCurrentSourceReview(db,projectId,dataDir))return {ok:false,reasoning:"Review target-language alignment and unresolved reference-only entries before inheriting the donor scene plan."};}
  catch(error){return {ok:false,reasoning:`Target source review is unavailable: ${(error as Error).message}`};}
  const existing=command(db,projectId,"materialize_edition_scenes");
  if(existing){const map=JSON.parse(existing.payload) as {scenes:Array<{targetSceneId:string}>};
    if(map.scenes.length && map.scenes.every(item=>row(db,"SELECT id FROM scenes WHERE id=? AND project_id=?",item.targetSceneId,projectId)))return {ok:true,reasoning:`Retained ${map.scenes.length} target-owned donor scene correspondences.`};
    return {ok:false,reasoning:"Saved edition scene mapping is incomplete; preserve it for reconciliation."};}
  if(row(db,"SELECT id FROM scenes WHERE project_id=? LIMIT 1",projectId))return {ok:false,reasoning:"Target scenes already exist without an edition mapping; review them before materialization."};
  const donorId=origin.preflight.donor.projectId;
  const donorScenes=db.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY sequence").all(donorId) as RecordRow[];
  if(!donorScenes.length)return {ok:false,reasoning:"The selected donor has no narrative scene plan."};
  const project=row(db,"SELECT id,language,book,chapter FROM projects WHERE id=?",projectId)!;
  const source=resolveAndBindSourcePaths(db,project as {id:string;language:string;book:string;chapter:number},dataDir);
  const verses=parseSourceTextByVerse(source.docxPath),markers=parseReferenceOnlyVerseMarkers(source.docxPath);
  const supplied=new Set([...verses.map(v=>v.verse),...markers.map(v=>v.verse)]);
  for(const scene of donorScenes){
    const start=parseVerseRange(String(scene.verse_start)).start,end=parseVerseRange(String(scene.verse_end)).end;
    if(!supplied.has(start)||!supplied.has(end))return {ok:false,reasoning:`Target source does not establish donor scene boundary ${scene.verse_start}–${scene.verse_end}.`};
  }
  const now=Date.now(),mapping:Array<{donorSceneId:string;targetSceneId:string;reason:string}>=[];
  db.exec("BEGIN IMMEDIATE");
  try{
    for(const donor of donorScenes){
      const targetId=randomUUID(),copy:RecordRow={...donor,id:targetId,project_id:projectId,created_at:now,
        reasoning:`Inherited reviewed narrative boundary from donor scene ${donor.id}; target Scripture and source alignment were separately reviewed. ${donor.reasoning??""}`};
      const columns=Object.keys(copy);
      db.prepare(`INSERT INTO scenes (${columns.map(name=>`"${name}"`).join(",")})VALUES(${columns.map(()=>"?").join(",")})`).run(...columns.map(name=>copy[name]??null));
      mapping.push({donorSceneId:String(donor.id),targetSceneId:targetId,reason:"Source-reviewed canonical verse boundary and retained donor story structure."});
    }
    appendCommand(db,projectId,"materialize_edition_scenes",{donorProjectId:donorId,sourceHash:origin.preflight.target.text?.sha256,scenes:mapping},now);
    db.exec("COMMIT");
    return {ok:true,reasoning:`Created ${mapping.length} target-owned scenes from the selected donor narrative after target source review; no donor row was altered.`};
  }catch(error){db.exec("ROLLBACK");return {ok:false,reasoning:`Edition scene materialization held: ${(error as Error).message}`};}
}

/** Stage 3 consumes only a named, exact target correspondence revision. */
export function materializeEditionCasting(db:DatabaseSync,dataDir:string,projectId:string):StageResult {
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)return {ok:false,reasoning:"This is not a language edition."};
  try{assertEditionInputsCurrent(db,dataDir,projectId);}catch(error){return {ok:false,reasoning:`Edition casting held: ${(error as Error).message}`};}
  try{if(!editionSourceIsCurrent(db,dataDir,projectId))return {ok:false,reasoning:"Target source bytes changed; casting held."};}
  catch(error){return {ok:false,reasoning:`Target source is unavailable: ${(error as Error).message}`};}
  const sceneCommand=command(db,projectId,"materialize_edition_scenes");
  if(!sceneCommand)return {ok:false,reasoning:"Edition scenes must complete stage 2 before shot correspondence."};
  const sceneMap=JSON.parse(sceneCommand.payload) as {scenes:Array<{donorSceneId:string;targetSceneId:string}>};
  const mappedScene=new Map(sceneMap.scenes.map(item=>[item.donorSceneId,item.targetSceneId]));
  const existing=command(db,projectId,"materialize_edition_shots");
  if(existing){const map=JSON.parse(existing.payload) as {planHash:string;shots:Array<{targetShotId:string}>};
    if(map.planHash!==readLanguageEditionPlan(db,projectId)?.hash)return {ok:false,reasoning:"Edition correspondence changed after target shots were materialized; reconcile existing shots before a new plan can run."};
    if(map.shots.length && map.shots.every(item=>row(db,"SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?",item.targetShotId,projectId)))return {ok:true,reasoning:`Retained ${map.shots.length} target-owned shot correspondences.`};
    return {ok:false,reasoning:"Saved edition shot map is incomplete; preserve it for reconciliation."};}
  if(row(db,"SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? LIMIT 1",projectId))return {ok:false,reasoning:"Target shots already exist without an edition map; review them before casting."};
  const plan=readLanguageEditionPlan(db,projectId);
  if(!plan?.revision)return {ok:false,reasoning:"Record a named exact target-audio correspondence plan before inheriting donor shots."};
  const render=row(db,"SELECT timeline_json FROM chapter_render_manifests WHERE render_id=?",origin.preflight.donor.renderId);
  if(!render || digest(String(render.timeline_json))!==origin.preflight.donor.timelineSha256)return {ok:false,reasoning:"Pinned donor picture recipe changed or is unavailable."};
  let picture:unknown;
  try{picture=JSON.parse(String(render.timeline_json));}catch{return {ok:false,reasoning:"Pinned donor picture recipe is invalid."};}
  if(!Array.isArray(picture))return {ok:false,reasoning:"Pinned donor picture recipe is not an ordered timeline."};
  const selected=new Set(picture.flatMap(item=>typeof item?.shotId==="string"?[item.shotId]:[]));
  if(!selected.size)return {ok:false,reasoning:"Normalized donor timeline has no source shot identities."};
  const mapped=new Set(plan.revision.correspondence.map(item=>item.donorShotId));
  if([...selected].some(id=>!mapped.has(id)) || [...mapped].some(id=>!selected.has(id)))
    return {ok:false,reasoning:"Reviewed correspondence must cover each selected donor shot and no unrelated shot."};
  const inherited=plan.revision.correspondence.filter(item=>!item.addedForEdition);
  if(JSON.stringify(picture.filter(item=>typeof item?.shotId==="string").map(item=>item.shotId))!==JSON.stringify(inherited.map(item=>item.donorShotId)))
    return {ok:false,reasoning:"Reviewed target correspondence must retain the selected donor picture order."};
  for(const id of selected){
    const count=picture.filter(item=>item?.shotId===id).length;
    if(inherited.filter(item=>item.donorShotId===id).length!==count)
      return {ok:false,reasoning:`Selected donor shot ${id} has ${count} picture placements; provide one explicit target correspondence for each.`};
  }
  for(const [index,item] of plan.revision.correspondence.entries())if(item.addedForEdition &&
      (item.treatment!=="needs_coverage" || index===0 || plan.revision.correspondence[index-1]?.donorShotId!==item.donorShotId))
    return {ok:false,reasoning:"An added target coverage beat must follow a selected donor shot in the same reviewed scene."};
  const now=Date.now(),mapping:Array<{donorShotId:string;targetShotId:string;treatment:string;targetSegmentId:string|null;reason:string;
    voiceIdentitySource?:"donor_utterance_binding"|"pinned_approved_character"}>=[];
  let activeRuns:ReturnType<typeof readConfirmedSpeechRuns>;
  try{activeRuns=readConfirmedSpeechRuns(db,projectId,dataDir);}catch(error){return {ok:false,reasoning:`Target speech-run evidence changed: ${(error as Error).message}`};}
  db.exec("BEGIN IMMEDIATE");
  try{
    const sequences=new Map<string,number>();
    for(const item of plan.revision.correspondence){
      const donor=row(db,"SELECT * FROM shots WHERE id=?",item.donorShotId)!;
      const targetSceneId=mappedScene.get(String(donor.scene_id));
      if(!targetSceneId)throw new Error("Donor shot scene has no target narrative correspondence.");
      const targetShotId=randomUUID(),next=(sequences.get(targetSceneId)??0)+1;sequences.set(targetSceneId,next);
      const copy:RecordRow={...donor,id:targetShotId,scene_id:targetSceneId,sequence:next,status:"planned",created_at:now};
      const columns=Object.keys(copy);
      db.prepare(`INSERT INTO shots (${columns.map(name=>`"${name}"`).join(",")})VALUES(${columns.map(()=>"?").join(",")})`).run(...columns.map(name=>copy[name]??null));
      const cast=db.prepare("SELECT character_id FROM shot_characters WHERE shot_id=?").all(item.donorShotId) as Array<{character_id:string}>;
      for(const member of cast){
        if(!row(db,"SELECT id FROM characters WHERE id=? AND canon_status='approved' AND region='Papuan'",member.character_id))throw new Error("Donor shot names an unapproved target canon member.");
        db.prepare("INSERT INTO shot_characters(shot_id,character_id)VALUES(?,?)").run(targetShotId,member.character_id);
      }
      let voiceIdentitySource: "donor_utterance_binding"|"pinned_approved_character"|undefined;
      if(Number(donor.needs_lip_sync)===1){
        const bindings=db.prepare("SELECT character_version_id FROM shot_utterance_bindings WHERE shot_id=?").all(item.donorShotId) as Array<{character_version_id:string}>;
        if(bindings.length>1)throw new Error("Selected donor speaking shot has an ambiguous retained utterance binding.");
        const pinned=origin.preflight.voices.filter(voice=>voice.characterId===donor.dialogue_character_id);
        const versionId=bindings.length===1?bindings[0]!.character_version_id:pinned.length===1?pinned[0]!.versionId:null;
        voiceIdentitySource=bindings.length===1?"donor_utterance_binding":"pinned_approved_character";
        if(!versionId || !item.targetSegmentId || item.targetStartMs===null || item.targetEndMs===null)
          throw new Error("Speaking shot needs one pinned approved character voice and an exact reviewed target window.");
        if(!pinned.some(voice=>voice.versionId===versionId))throw new Error("Speaking shot voice is outside the pinned edition identity.");
        const current=row(db,"SELECT start_ms,end_ms,speaker_character_id,source_path FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'",item.targetSegmentId,projectId);
        const run=item.targetSpeechRunId?activeRuns.find(value=>value.id===item.targetSpeechRunId):null;
        if(item.targetSpeechRunId && (!run || !run.members.some(member=>member.id===item.targetSegmentId)))throw new Error("Reviewed target speech run changed or does not contain its anchor segment.");
        if(!current || Number(run?.startMs??current.start_ms)>item.targetStartMs || Number(run?.endMs??current.end_ms)<item.targetEndMs ||
            (run?.characterId??current.speaker_character_id)!==donor.dialogue_character_id || current.source_path!==origin.preflight.target.audio?.path)
          throw new Error("Reviewed target utterance bounds, speaker or source changed after correspondence review.");
        const bindingId=randomUUID();
        db.prepare("INSERT INTO shot_utterance_bindings(id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by)VALUES(?,?,?,?,?,?,?,?,?)")
          .run(bindingId,targetShotId,item.targetSegmentId,item.targetStartMs,item.targetEndMs,versionId,run?.audioHash??origin.preflight.target.audio!.sha256,now,plan.revision.reviewer);
        if(run){const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
          db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'bind_speech_run_utterance',?,?,?)")
            .run(randomUUID(),projectId,sequence,JSON.stringify({binding:{id:bindingId,shotId:targetShotId,sourceSegmentId:item.targetSegmentId,startMs:item.targetStartMs,endMs:item.targetEndMs,
              characterVersionId:versionId,sourceHash:run.audioHash},speechRunId:run.id,timingEvidence:item.reason,approvedBy:plan.revision.reviewer,
              voiceIdentitySource}),
              `speech-binding:${bindingId}`,now);}
      }
      mapping.push({donorShotId:item.donorShotId,targetShotId,treatment:item.treatment,targetSegmentId:item.targetSegmentId,reason:item.reason,voiceIdentitySource});
    }
    const title=origin.preflight.target.title;
    const intro=buildChapterIntroPlan({title:title.bookChapter,language:origin.preflight.target.language,languageLabel:title.languageName,
      titleDurationMs:title.durationMs,titleProfile:title.profile,grounding:"Selected donor establishing picture; target-language source timing awaits editorial review."});
    db.prepare("INSERT INTO chapter_intro_plans(project_id,plan_json,status,created_at,updated_at)VALUES(?,?,?,?,?)")
      .run(projectId,JSON.stringify(intro),intro.status,now,now);
    appendCommand(db,projectId,"materialize_edition_shots",{planHash:plan.hash,donorRenderId:origin.preflight.donor.renderId,shots:mapping},now);
    db.exec("COMMIT");
    return {ok:true,reasoning:`Created ${mapping.length} target-owned shots from reviewed correspondence; speaking shots bind exact target windows. Donor assets and approvals remain separate.`};
  }catch(error){db.exec("ROLLBACK");return {ok:false,reasoning:`Edition casting held: ${(error as Error).message}`};}
}

/** Stage 4 reuses reviewed picture bytes locally; it never calls a provider. */
export function materializeEditionMedia(db:DatabaseSync,dataDir:string,projectId:string):StageResult {
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)return {ok:false,reasoning:"This is not a language edition."};
  try{assertEditionInputsCurrent(db,dataDir,projectId);}catch(error){return {ok:false,reasoning:`Edition picture reuse held: ${(error as Error).message}`};}
  const shotRecord=command(db,projectId,"materialize_edition_shots");
  const plan=readLanguageEditionPlan(db,projectId);
  if(!shotRecord||!plan?.revision)return {ok:false,reasoning:"Reviewed target shots and exact correspondence are required before picture reuse."};
  const mapped=JSON.parse(shotRecord.payload) as {planHash:string;shots:Array<{donorShotId:string;targetShotId:string;treatment:string}>};
  if(mapped.planHash!==plan.hash)return {ok:false,reasoning:"Target shot correspondence changed; picture reuse must be reconciled."};
  const previous=command(db,projectId,"materialize_edition_media");
  if(previous){
    const saved=JSON.parse(previous.payload) as {planHash:string;assets:Array<{path:string;sha256:string;targetShotId:string;operation:string}>};
    if(saved.planHash!==plan.hash)return {ok:false,reasoning:"Edition picture plan changed after media preparation; retain the old assets for review."};
    if(saved.assets.every(asset=>existsSync(productionAssetPath(dataDir,asset.path)) && digest(readFileSync(productionAssetPath(dataDir,asset.path)))===asset.sha256 &&
      row(db,"SELECT ga.id FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE ga.shot_id=? AND ga.operation=? AND ga.status='accepted' AND ga.result_asset_path=? AND sc.project_id=?",asset.targetShotId,asset.operation,asset.path,projectId)))
      return {ok:true,reasoning:`Retained ${saved.assets.length} reviewed picture reuse assets; no provider request was made.`};
    return {ok:false,reasoning:"A retained edition picture changed or is missing; do not regenerate or approve it automatically."};
  }
  const missingCoverage:string[]=[];
  for(const item of mapped.shots.filter(item=>item.treatment==="needs_coverage")){
    const frame=row(db,"SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted' AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1",item.targetShotId);
    const speaking=Number(row(db,"SELECT needs_lip_sync FROM shots WHERE id=?",item.targetShotId)?.needs_lip_sync)===1;
    const motion=speaking ? null : row(db,`SELECT ga.result_asset_path FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
      WHERE c.shot_id=? AND ga.operation='generate_final_video' AND ga.provider='ltx_local' AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL ORDER BY ga.created_at DESC LIMIT 1`,item.targetShotId);
    const frameReady=typeof frame?.result_asset_path==="string" && existsSync(productionAssetPath(dataDir,frame.result_asset_path));
    const motionReady=speaking || (typeof motion?.result_asset_path==="string" && existsSync(productionAssetPath(dataDir,motion.result_asset_path)));
    if(!frameReady || !motionReady)missingCoverage.push(item.targetShotId);
  }
  if(missingCoverage.length)return {ok:false,reasoning:`Reviewed target picture needs new coverage for shot(s) ${missingCoverage.join(", ")}. Generate and review a target-owned Codex handoff keyframe, then local LTX video for non-speaking shots, before completing media preparation.`};
  const manifest=row(db,"SELECT timeline_json FROM chapter_render_manifests WHERE render_id=?",origin.preflight.donor.renderId);
  if(!manifest||digest(String(manifest.timeline_json))!==origin.preflight.donor.timelineSha256)return {ok:false,reasoning:"Pinned donor picture recipe changed."};
  const timeline=JSON.parse(String(manifest.timeline_json)) as Array<{shotId:string|null;path?:string;sha256?:string;sourceStartMs?:number;startMs:number;endMs:number}>;
  const placements=new Map<string,typeof timeline>();
  for(const item of timeline)if(item.shotId){const list=placements.get(item.shotId)??[];list.push(item);placements.set(item.shotId,list);}
  const pinned=new Map<string,typeof origin.preflight.pictureEvidence>();
  for(const item of origin.preflight.pictureEvidence){const list=pinned.get(item.shotId)??[];list.push(item);pinned.set(item.shotId,list);}
  const preparations:Array<{targetShotId:string;operation:"generate"|"generate_final_video";path:string;sha256:string;durationMs:number|null;donorShotId:string;donorPath:string}>=[];
  try{
    for(const [index,item] of mapped.shots.entries()){
      const reviewed=plan.revision?.correspondence[index];
      if(!reviewed || reviewed.donorShotId!==item.donorShotId || reviewed.treatment!==item.treatment)
        throw new Error("Target picture selection differs from its reviewed correspondence.");
      if(reviewed.addedForEdition){
        if(item.treatment!=="needs_coverage")throw new Error("An added target beat requires its own picture coverage.");
        continue;
      }
      const placement=placements.get(item.donorShotId)?.shift();
      if(!placement)throw new Error(`No pinned picture placement remains for donor shot ${item.donorShotId}.`);
      const evidence=pinned.get(item.donorShotId)?.shift();
      if(!evidence || placement.path!==evidence.path || placement.sha256!==evidence.sha256 || (placement.sourceStartMs??0)!==evidence.sourceStartMs || placement.endMs-placement.startMs!==evidence.durationMs)
        throw new Error("Selected picture placement differs from the frozen edition evidence.");
      if(item.treatment==="needs_coverage")continue;
      const target=row(db,"SELECT needs_lip_sync FROM shots WHERE id=?",item.targetShotId);
      if(!target)throw new Error("Target shot was removed after correspondence review.");
      const keyPath=evidence.keyframePath,keyAbs=productionAssetPath(dataDir,keyPath),keyHash=digest(readFileSync(keyAbs));
      if(keyHash!==evidence.keyframeSha256)throw new Error("Pinned donor scene-specific keyframe changed.");
      preparations.push({targetShotId:item.targetShotId,operation:"generate",path:keyPath,sha256:keyHash,durationMs:null,donorShotId:item.donorShotId,donorPath:keyPath});
      if(Number(target.needs_lip_sync)===1){
        if(item.treatment!=="replace_avatar")throw new Error("Visible mouth coverage requires a new target-language Avatar take.");
        continue;
      }
      if(item.treatment!=="reuse_picture"||!placement.path||!placement.sha256||!Number.isInteger(placement.startMs)||!Number.isInteger(placement.endMs)||placement.endMs<=placement.startMs)
        throw new Error(`Donor shot ${item.donorShotId} lacks an exact reviewed reusable picture interval and hash.`);
      const reuse=reviewed.pictureReuse;
      const donorPath=reuse?.path??placement.path,donorSha=reuse?.sha256??placement.sha256;
      if(!donorPath || !donorSha || donorPath===origin.preflight.donor.renderPath)throw new Error("Final mixed donor program cannot be used as a reusable picture stem.");
      if(reuse){
        const selected=row(db,`SELECT ga.result_asset_path AS path FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id
          WHERE ga.id=? AND ga.shot_id=? AND ga.operation='generate_final_video' AND ga.status='accepted' LIMIT 1`,reuse.attemptId,item.donorShotId);
        if(selected?.path!==donorPath)throw new Error("Reviewed donor picture handle selection changed.");
      }
      const source=productionAssetPath(dataDir,donorPath);
      if(digest(readFileSync(source))!==donorSha)throw new Error("Pinned donor picture clip or reviewed handle changed.");
      const durationMs=reuse?.durationMs??placement.endMs-placement.startMs,startMs=reuse?.sourceStartMs??placement.sourceStartMs??0;
      if(startMs<0||startMs+durationMs>mediaDurationMs(source)+50)throw new Error("Donor picture trim exceeds its retained clip.");
      const outRel=`generated/${origin.preflight.target.language}/${origin.preflight.target.book}-${origin.preflight.target.chapter}/edition-reuse/${plan.hash}/${item.targetShotId}.mp4`;
      const output=productionAssetPath(dataDir,outRel);mkdirSync(dirname(output),{recursive:true});
      if(!existsSync(output))execFileSync("ffmpeg",["-v","error","-n","-ss",String(startMs/1000),"-i",source,"-t",String(durationMs/1000),"-an",
        "-vf","scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24","-c:v","libx264","-crf","18",output],{stdio:["ignore","ignore","pipe"]});
      if(Math.abs(mediaDurationMs(output)-durationMs)>60)throw new Error("Locally reused picture does not retain the reviewed trim duration.");
      preparations.push({targetShotId:item.targetShotId,operation:"generate_final_video",path:outRel,sha256:digest(readFileSync(output)),durationMs,donorShotId:item.donorShotId,donorPath});
    }
  }catch(error){return {ok:false,reasoning:`Edition picture reuse held: ${(error as Error).message}`};}
  const now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try{
    if(command(db,projectId,"materialize_edition_media"))throw new Error("Another picture reuse operation was recorded; refresh before retrying.");
    for(const prepared of preparations){
      const attempt=randomUUID();
      db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,'retained_edition_picture','local_verified_reuse',?,?,'accepted',?,0,?)")
        .run(attempt,prepared.targetShotId,prepared.operation,`Reviewed edition correspondence ${plan.hash}; donor shot ${prepared.donorShotId}; source ${prepared.donorPath}; SHA256 ${prepared.sha256}`,prepared.path,now);
      if(prepared.durationMs!==null)db.prepare("INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES(?,?,?,0,?,?)")
        .run(randomUUID(),prepared.targetShotId,attempt,prepared.durationMs,now);
    }
    appendCommand(db,projectId,"materialize_edition_media",{planHash:plan.hash,assets:preparations.map(({path,sha256,operation,targetShotId,donorShotId,donorPath})=>({path,sha256,operation,targetShotId,donorShotId,donorPath})),
      reviewer:plan.revision.reviewer,evidence:plan.revision.evidence,noProviderCalls:true,noNewCost:true},now);
    db.exec("COMMIT");
    return {ok:true,reasoning:`Prepared ${preparations.length} reviewed target picture assets from pinned donor media with zero provider requests and no duplicate cost entries.`};
  }catch(error){db.exec("ROLLBACK");return {ok:false,reasoning:`Edition picture reuse held: ${(error as Error).message}`};}
}
