/** One-time normalization of Dan's final Mark 4 picture in an isolated DB copy.
 * The historical recipe is retained verbatim in the appended edit command. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const PROJECT_ID="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const RENDER_ID="deefa536-62f9-41b3-bbac-e9e8fb244206";
const FINAL_SHA="b207b4c0109d70e85fab40ccb9253e7973c4cd38213333307153d417fda8aa6a";
const CHUNKS=[
  {first:0,last:3105,frames:3106,path:"legacy-mark4/chunk00.mp4",sha256:"55dbaa70bdfa4486b25024f89b9b50373d264665c75de43b7df395fa442ad383"},
  {first:3106,last:6603,frames:3498,path:"legacy-mark4/chunk01.mp4",sha256:"fba0150be2fe808ba4d1fe8b08d13f0044571af1c54e6ef37410970322ac40a1"},
  {first:6604,last:9989,frames:3386,path:"legacy-mark4/chunk02.mp4",sha256:"a09b61b53d2cd4176291382d1500d6bc84141a0456771780afffdfffc5568594"},
  {first:9990,last:11472,frames:1483,path:"legacy-mark4/chunk03.mp4",sha256:"e18ef678502c157bc6e13b6279316242c8c9e411ece5d97255935763ab3a9f36"},
  {first:11473,last:13483,frames:2011,path:"legacy-mark4/chunk04.mp4",sha256:"1cc249e80d64b67156d204b92011a6a47d9ce81255cf5b6728f95239543cbd14"}
] as const;
const sha=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
const asset=(dataDir:string,path:string)=>{
  const root=resolve(dataDir,"assets"),file=resolve(root,path),rel=relative(root,file);
  if(isAbsolute(path) || rel===".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))throw new Error("Donor asset escaped the isolated data root.");
  return file;
};
const ms=(frames:number)=>Math.round(frames*1000/24);

export type Mark4PicturePlacement =
  | { kind:"replaceable_title"; startFrame:0; endFrame:95; reason:string }
  | { shotId:string; kind?:"shot"; startFrame:number; endFrame:number; reason:string };
export interface Mark4PicturePlan {
  schemaVersion:1; renderId:string; expectedOriginalTimelineSha256:string;
  reviewer:string; evidence:string; placements:Mark4PicturePlacement[];
}

/** Inclusive 24 fps frame boundaries; every source interval stays in one silent chunk. */
export function validateMark4PicturePlacements(placements:Mark4PicturePlacement[]){
  if(!Array.isArray(placements) || !placements.length)throw new Error("No reviewed final-picture placements were supplied.");
  let nextFrame=0;
  const mapped=[] as Array<{placement:Mark4PicturePlacement;chunk:(typeof CHUNKS)[number]}>;
  for(const placement of placements){
    const title=placement?.kind==="replaceable_title";
    if(!placement || !placement.reason?.trim() || (!title && !("shotId" in placement && placement.shotId?.trim())) ||
        (title && (placement.startFrame!==0 || placement.endFrame!==95 || "shotId" in placement)) ||
        !Number.isInteger(placement.startFrame) ||
        !Number.isInteger(placement.endFrame) || placement.startFrame!==nextFrame || placement.endFrame<placement.startFrame || placement.endFrame>13483)
      throw new Error(`Final-picture map has a gap, overlap or missing shot identity at frame ${nextFrame}.`);
    const chunk=CHUNKS.find(item=>placement.startFrame>=item.first && placement.endFrame<=item.last);
    if(!chunk)throw new Error(`Picture placement crosses a silent-chunk boundary at frame ${placement.startFrame}.`);
    mapped.push({placement,chunk});nextFrame=placement.endFrame+1;
  }
  if(nextFrame!==13484)throw new Error(`Final-picture map stops at frame ${nextFrame-1}, before the final frame.`);
  if(placements[0]?.kind!=="replaceable_title" || placements.slice(1).some(item=>item.kind==="replaceable_title"))
    throw new Error("The Hatam title must be isolated as the replaceable first 96 frames.");
  return mapped;
}

export function normalizeMark4FinalDonor(db:DatabaseSync,dataDir:string,plan:Mark4PicturePlan):{created:boolean;placements:number;timelineSha256:string} {
  if(plan?.schemaVersion!==1 || plan.renderId!==RENDER_ID || !/^[a-f0-9]{64}$/.test(plan.expectedOriginalTimelineSha256) ||
      !plan.reviewer?.trim() || !plan.evidence?.trim() || !Array.isArray(plan.placements) || !plan.placements.length)
    throw new Error("A complete named Mark 4 final-picture review plan is required.");
  const render=db.prepare(`SELECT r.result_asset_path AS path,r.total_duration_ms AS durationMs,m.timeline_json AS timeline,m.source_audio_json AS soundtrack
    FROM chapter_renders r JOIN chapter_render_manifests m ON m.render_id=r.id WHERE r.id=? AND r.project_id=?`).get(RENDER_ID,PROJECT_ID) as
    {path:string;durationMs:number;timeline:string;soundtrack:string}|undefined;
  if(!render || render.path!=="generated/chapter/Markus-4.mp4" || render.durationMs!==ms(13484) ||
      sha(readFileSync(asset(dataDir,render.path)))!==FINAL_SHA)throw new Error("The exact final Mark 4 film is unavailable or changed.");
  const planHash=sha(JSON.stringify(plan));
  const prior=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='normalize_edition_donor_picture' AND undone=0").get(PROJECT_ID) as {payload:string}|undefined;
  if(prior){
    const saved=JSON.parse(prior.payload) as {planHash:string;normalizedTimelineSha256:string};
    if(saved.planHash!==planHash || saved.normalizedTimelineSha256!==sha(render.timeline))throw new Error("A different final-picture normalization is already retained.");
    return {created:false,placements:plan.placements.length,timelineSha256:saved.normalizedTimelineSha256};
  }
  if(sha(render.timeline)!==plan.expectedOriginalTimelineSha256 || Array.isArray(JSON.parse(render.timeline)))
    throw new Error("The original legacy picture recipe differs from the reviewed plan.");
  if(!db.prepare(`SELECT id FROM edit_commands WHERE project_id=? AND undone=0 AND command_type='producer_decision'
      AND json_valid(payload) AND json_extract(payload,'$.renderId')=? AND json_extract(payload,'$.decision')='approved' LIMIT 1`).get(PROJECT_ID,RENDER_ID))
    throw new Error("The final cut needs Dan's exact producer selection in this isolated copy.");
  for(const chunk of CHUNKS){
    const file=asset(dataDir,chunk.path);
    if(sha(readFileSync(file))!==chunk.sha256)throw new Error(`Verified silent chunk changed: ${chunk.path}`);
    const streams=JSON.parse(execFileSync("ffprobe",["-v","error","-count_frames","-show_streams","-of","json",file],{encoding:"utf8"})) as
      {streams:Array<{codec_type:string;nb_read_frames?:string}>};
    if(streams.streams.length!==1 || streams.streams[0]?.codec_type!=="video" || Number(streams.streams[0].nb_read_frames)!==chunk.frames)
      throw new Error(`Final-picture chunk has unexpected frames or audio: ${chunk.path}`);
  }
  const timeline:Array<{shotId?:string;kind?:"replaceable_title";path:string;sha256:string;sourceStartMs:number;startMs:number;endMs:number}>=[];
  const selected=new Map<string,{shotId:string;path:string;operation:"lip_sync"|"generate_final_video";durationMs:number}>();
  for(const {placement,chunk} of validateMark4PicturePlacements(plan.placements)){
    if(placement.kind==="replaceable_title"){
      // The target's reviewed pre-source title replaces these exact Hatam-
      // lettered frames. Retain their picture hash and interval as provenance,
      // but never offer them as a reusable donor shot.
      timeline.push({kind:"replaceable_title",path:chunk.path,sha256:chunk.sha256,sourceStartMs:0,startMs:0,endMs:4000});
      continue;
    }
    const shot=db.prepare(`SELECT sh.id,sh.needs_lip_sync AS speaking FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?`)
      .get(placement.shotId,PROJECT_ID) as {id:string;speaking:number}|undefined;
    if(!shot)throw new Error(`Picture placement has no retained donor shot ${placement.shotId}.`);
    const keyframe=db.prepare("SELECT result_asset_path AS path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1")
      .get(shot.id) as {path:string}|undefined;
    if(!keyframe)throw new Error(`Donor shot ${shot.id} lacks an accepted scene-specific keyframe.`);
    readFileSync(asset(dataDir,keyframe.path));
    const operation=shot.speaking===1?"lip_sync":"generate_final_video";
    selected.set(`${shot.id}:${chunk.path}`,{shotId:shot.id,path:chunk.path,operation,durationMs:ms(chunk.frames)});
    timeline.push({shotId:shot.id,path:chunk.path,sha256:chunk.sha256,sourceStartMs:ms(placement.startFrame-chunk.first),
      startMs:ms(placement.startFrame),endMs:ms(placement.endFrame+1)});
  }
  const normalized=JSON.stringify(timeline),timelineHash=sha(normalized),now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try{
    if(db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='normalize_edition_donor_picture' LIMIT 1").get(PROJECT_ID))
      throw new Error("Another normalization was recorded; inspect it before retrying.");
    for(const item of selected.values()){
      const attemptId=randomUUID();
      db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
        VALUES(?,?,'legacy_silent_picture','verified_v73_chunk',?,?,'accepted',?,0,?)`)
        .run(attemptId,item.shotId,item.operation,`Imported reviewed final picture; ${plan.reviewer}: ${plan.evidence}`,item.path,now);
      db.prepare("INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES(?,?,?,0,?,?)")
        .run(randomUUID(),item.shotId,attemptId,item.durationMs,now);
    }
    const changed=db.prepare("UPDATE chapter_render_manifests SET timeline_json=? WHERE render_id=? AND timeline_json=?")
      .run(normalized,RENDER_ID,render.timeline);
    if(changed.changes!==1)throw new Error("Legacy manifest changed during normalization.");
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(PROJECT_ID) as {n:number}).n);
    db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone)
      VALUES(?,?,?,'normalize_edition_donor_picture',?,?,?,0)`).run(randomUUID(),PROJECT_ID,sequence,JSON.stringify({planHash,reviewer:plan.reviewer,
        evidence:plan.evidence,originalTimeline:render.timeline,originalTimelineSha256:sha(render.timeline),originalSoundtrackSha256:sha(render.soundtrack),
        finalFilmSha256:FINAL_SHA,normalizedTimelineSha256:timelineHash,placements:plan.placements,chunkHashes:CHUNKS.map(({path,sha256})=>({path,sha256}))}),
        `language-edition:${RENDER_ID}:normalize-picture`,now);
    db.exec("COMMIT");
    return {created:true,placements:timeline.length,timelineSha256:timelineHash};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
