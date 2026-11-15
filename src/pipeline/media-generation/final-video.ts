import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import type { GenerationProgress, VideoTier } from "../../providers/types.js";
import type { VideoProviders } from "../../providers/video-selection.js";
import { reviewGeneratedVideo, videoReviewPassed } from "../qc/video-review.js";
import { generateSelectedFinalVideo } from "./select-final-video.js";
import { beginVideoJob } from "./video-job-status.js";
import { shotRiskFor, tierForRisk } from "./shot-risk-lookup.js";
import { registerVideoAmbience } from "../assembly/soundtrack.js";
import { productionAuthorization, directionsFromRun, requireCurrentPlan, bindAttemptRevision, validateAttemptRevision } from "../creative-direction/crew-store.js";
import { productionAssetPath } from "../creative-direction/crew-context.js";

/** Desktop's API encoder accepts 5,000 characters, including provider rules.
 * Keep the authoritative per-shot prose; chapter treatment/FDL stay in the
 * pinned production record rather than becoming motion-model instructions. */
export function localMotionDirection(direction:string):string {
  // The accepted Director is the sole per-shot handoff. Generic crowd/action
  // wrappers can invite gestures that this particular quiet shot forbids.
  const header=/(?:^|\n)APPROVED FILM DIRECTION \([^)]+\):\s*/.exec(direction);
  let focused=header?direction.slice(header.index+header[0].length):direction;
  focused=focused.split("\nACCEPTED FDL CONSTRAINTS")[0]!.split("\nACCEPTED EMOTIONAL TREATMENT")[0]!;
  if(header){
    // This trailing source quotation is evidence, not words for LTX to speak.
    // Use the last delimiter so an instruction's own earlier Purpose line is
    // retained; the handoff formatter always appends its separate source basis.
    const purpose=focused.lastIndexOf("\nPurpose: ");
    if(purpose>=0)focused=focused.slice(0,purpose);
    focused=focused.replace(/^production director:\s*/i,"");
  }
  return focused
    .replace(/APPROVED FILM DIRECTION \([^)]+\):\s*/g,"")
    // Wardrobe comes from the approved picture; an off-screen chapter list
    // must not materialize extra people. Other actual shot prose stays exact.
    .replace(/[^.!?]*\bwears?\s[^.!?]*[.!?]?/gi,"").trim();
}

export interface NonSpeakingVideoPolicy {
  allowDraftFallback?: boolean;
  durationSeconds?: 5 | 8 | 10;
  /** A saved Director extension request can add a take without removing the
   * reviewed short take. Later held jobs/candidates still stop submission. */
  additionalCoverage?: { acceptedAttemptId: string; requestNoteId: string; reason: string };
}

export async function generateNonSpeakingVideoCandidate(db:DatabaseSync, projectId:string, shotId:string, providers:VideoProviders, policy:NonSpeakingVideoPolicy={}) {
  const durationSeconds = policy.durationSeconds ?? 8;
  const shot=db.prepare(`SELECT sh.id,sh.action,sh.crowd_density FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE sh.id=? AND s.project_id=? AND sh.needs_lip_sync=0`).get(shotId,projectId) as {id:string;action:string;crowd_density:string|null}|undefined;
  if (!shot) throw new Error("Only a non-speaking shot in this project can receive ordinary final video.");
  const selected=db.prepare(`SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    JOIN shots sh ON sh.id=c.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    LEFT JOIN project_restart_cutovers cutover ON cutover.project_id=sc.project_id
    WHERE c.shot_id=? AND ga.status='accepted' AND (cutover.started_at IS NULL OR ga.created_at>=cutover.started_at)`).get(shotId) as {id:string}|undefined;
  let coverageBasisCreatedAt: number | null = null;
  if (policy.additionalCoverage) {
    const request=policy.additionalCoverage;
    if (!request.reason.trim()) throw new Error("Additional coverage needs its measured source-coverage reason.");
    const basis=db.prepare(`SELECT ga.created_at FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id
      JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
      LEFT JOIN project_restart_cutovers cutover ON cutover.project_id=sc.project_id
      WHERE ga.id=? AND ga.shot_id=? AND ga.operation IN ('generate_final_video','trim_final_video') AND ga.status='accepted'
        AND (cutover.started_at IS NULL OR ga.created_at>=cutover.started_at)`).get(request.acceptedAttemptId,shotId) as {created_at:number}|undefined;
    const approval=db.prepare(`SELECT id,note FROM review_notes WHERE id=? AND project_id=? AND subject_type='shot'
      AND subject_id=? AND source='qc' AND (note LIKE 'Production Director approved edit: extend_existing:%'
        OR note LIKE 'Production Director approved source coverage v1:%')`).get(request.requestNoteId,projectId,shotId) as {id:string;note:string}|undefined;
    if (!selected || !basis || !approval) throw new Error("Additional coverage requires this shot's selected accepted take and saved Director extension request.");
    // More picture of the same approved action is an execution request, not a
    // creative edit that invalidates the plan it must execute. Pin that narrower
    // authority explicitly; actual creative edits retain their existing path.
    const coveragePrefix="Production Director approved source coverage v1:";
    if (approval.note.startsWith(coveragePrefix)) {
      let pin: {kind?:string;runId?:string;briefHash?:string;acceptedAttemptId?:string;reason?:string};
      try { pin=JSON.parse(approval.note.slice(coveragePrefix.length)); }
      catch { throw new Error("Additional coverage approval has invalid revision evidence."); }
      const plan=requireCurrentPlan(db,getDataDir(),projectId);
      if (!pin || pin.kind!=="same_approved_action" || pin.runId!==plan.id || pin.briefHash!==plan.brief_hash
        || pin.acceptedAttemptId!==request.acceptedAttemptId || pin.reason!==request.reason) {
        throw new Error("Additional coverage approval must match the current plan, accepted take and measured reason.");
      }
    }
    coverageBasisCreatedAt=Number(basis.created_at);
  } else if (selected) return {status:"reused" as const,clipId:selected.id};
  const prior=db.prepare(`SELECT ga.id,ga.status,ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    LEFT JOIN project_restart_cutovers cutover ON cutover.project_id=sc.project_id
    WHERE ga.shot_id=? AND ga.operation='generate_final_video' AND ga.status!='retry_modified'
      AND (? IS NULL OR ga.created_at>?)
      AND (cutover.started_at IS NULL OR ga.created_at>=cutover.started_at)
    ORDER BY ga.created_at DESC LIMIT 1`).get(shotId,coverageBasisCreatedAt,coverageBasisCreatedAt) as {id:string;status:string;result_asset_path:string|null}|undefined;
  if (prior) return {status:"held" as const,attemptId:prior.id,reason:`Existing final-video candidate is ${prior.status}; reconcile or review it before another request.`};
  const local = providers.primaryBackend === "ltx";
  if (durationSeconds !== 8 && (!local || ![5,10].includes(durationSeconds))) throw new Error("Five- or ten-second non-speaking coverage requires the configured local LTX backend; other final requests remain eight seconds.");
  if (local) {
    const unfinished = db.prepare("SELECT id,status FROM video_generation_jobs WHERE shot_id=? AND status IN ('active','held') ORDER BY updated_at DESC LIMIT 1").get(shotId) as {id:string;status:string}|undefined;
    if (unfinished) return {status:"held" as const,reason:`LTX job ${unfinished.id} is ${unfinished.status}; reconcile its retained output before another submission.`};
  }
  // A risky shot commits to a full render only after a draft has been
  // chosen -- docs/design/media-generation.md's draft-then-commit rule.
  // Guarded here rather than in the stage loop so the per-shot API route
  // cannot skip it, and it refuses before spending anything.
  const risk=shotRiskFor(db,shotId);
  if (risk.draftFirst) {
    const chosenDraft=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_draft' AND status='accepted' LIMIT 1").get(shotId) as {id:string}|undefined;
    if (!chosenDraft) return {status:"needs_draft" as const,reason:`Shot risk ${risk.tier} (${risk.reasons.join("; ")}): choose a draft before committing a ${tierForRisk(risk)} render.`};
  }
  const keyframe=db.prepare("SELECT result_asset_path,prompt FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(shotId) as {result_asset_path:string;prompt:string|null}|undefined;
  if (!keyframe) throw new Error("Final video is held: this shot needs an accepted reviewed keyframe.");
  const characters=db.prepare("SELECT sc.character_id characterId,cv.id characterVersionId,c.name FROM shot_characters sc JOIN character_versions cv ON cv.character_id=sc.character_id AND cv.status='approved' JOIN characters c ON c.id=sc.character_id WHERE sc.shot_id=?").all(shotId) as Array<{characterId:string;characterVersionId:string;name:string}>;
  if (!characters.length && /character|person|jesus/i.test(shot.action)) throw new Error("Final video is held: visible canon characters need approved versions.");
  // A shot's own crowd/cast/camera facts decide how good a render it gets
  // -- see casting/shot-risk.ts. Routine frames stay on the cheapest tier
  // instead of every shot buying the same render.
  const tier:VideoTier=tierForRisk(risk);
  // The video vendor blocks real-person names and likeness sheets. The
  // accepted keyframe is therefore the only visual identity anchor here;
  // retain the scene action while replacing canonical names with roles.
  const safeAction=redactCharacterNames(shot.action,characters.map(character=>character.name));
  const prompt=`Animate the supplied approved start frame. Preserve its exact people, Papuan/Hatam wardrobe, setting, camera framing, and action: ${safeAction}

NON-SPEAKING VIDEO RULE: Do not generate dialogue, narration, singing, lip-sync performance, intelligible words, or visible speech from any person. Preserve natural nonverbal action and background ambience only. Keep every visible person in the approved Papuan/Hatam canon identity and wardrobe throughout; never drift toward Caucasian, Levantine, European, or generic substitute identities.

NATURAL CROWD MOTION RULE: Crowd movement is independently timed and irregular. At most a few people reach, shift, or react at once while others hold, breathe, look, edge forward, or respond subtly at different moments. Never generate a synchronized wave of arms, a repeated group gesture, mirrored movement, or a mass simultaneous reach-and-retract.`;
  const authorization=productionAuthorization(db,getDataDir(),projectId);
  const direction=directionsFromRun(requireCurrentPlan(db,getDataDir(),projectId),shotId);
  const acceptedPrompt=redactCharacterNames(local?localMotionDirection(prompt+direction):prompt+direction,characters.map(c=>c.name))+
    "\nVISIBLE CAST SCOPE: Preserve the actual people visible in the approved start frame throughout this clip. Broader chapter or wardrobe directions mentioning other people are off-screen context, not permission to introduce another person. Do not add, duplicate or replace any face or figure.\n"+
    (characters.length>0 && ["sparse","empty"].includes(shot.crowd_density??"") ? `This sparse shot has exactly ${characters.length} established named people. Keep that same count throughout; nobody else appears from inside the boat, behind a person, or at a frame edge.\n` : "");
  const job = local ? beginVideoJob(db,projectId,shotId,"ltx") : undefined;
  let submitted = false;
  let result;
  try {
    authorization.assertCurrent();
    result = await generateSelectedFinalVideo(providers,{shotId,prompt:acceptedPrompt,characters:[],authorizeSubmission:authorization.assertCurrent,productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash}},{resolution:"720p",startFrame:{path:keyframe.result_asset_path},durationSeconds,tier,allowKlingSceneFallback:false,allowDraftFallback:policy.allowDraftFallback,onProgress:(progress:GenerationProgress) => { if(progress.phase === "submitted") submitted = true; job?.progress(progress); }});
  } catch(error) {
    job?.finish(submitted ? "held" : "error",{error:(error as Error).message,submissionMayHaveStarted:submitted});
    throw error;
  }
  const id=randomUUID(), now=Date.now();
  // A final clip is not safe merely because the provider returned a file.
  // Review it against the approved keyframe before it can be auto-selected;
  // this is specifically the guard against identity/casting drift after the
  // first frame of a video.
  let reviewNote="video review unavailable";
  let reviewPassed=false;
  let reviewCostUsd: number | undefined;
  let reviewInput: Awaited<ReturnType<typeof reviewGeneratedVideo>>["reviewInput"];
  let endFrameReference: Awaited<ReturnType<typeof reviewGeneratedVideo>>["endFrameReference"];
  if(result.media?.path) {
    try {
      let endpoint: typeof endFrameReference;
      if (result.metadata?.sourceEndKeyframe !== undefined || result.metadata?.sourceEndKeyframeSha256 !== undefined) {
        const path=result.metadata.sourceEndKeyframe, sha256=result.metadata.sourceEndKeyframeSha256, assets=resolve(getDataDir(),"assets");
        if (typeof path!=="string" || typeof sha256!=="string" || !/^[a-f0-9]{64}$/.test(sha256) || isAbsolute(path)) throw new Error("Provider ending reference is incomplete or outside project assets.");
        const absolute=resolve(assets,path), location=relative(assets,absolute);
        if (location===".." || location.startsWith("..\\") || location.startsWith("../") || isAbsolute(location)) throw new Error("Provider ending reference is outside project assets.");
        endpoint={path:absolute,sha256};
      }
      const review=await reviewGeneratedVideo({videoPath:join(getDataDir(),"assets",result.media.path),keyframePath:join(getDataDir(),"assets",keyframe.result_asset_path),instruction:result.provenance.prompt || acceptedPrompt,...(endpoint?{endFrameReference:endpoint}:{})});
      reviewPassed=videoReviewPassed(review.verdict);
      reviewNote=`${reviewPassed?"passed":"FAILED"} final video review (confidence ${review.verdict.confidence}): ${review.verdict.reason}`;
      reviewCostUsd=review.costUsd;
      reviewInput=review.reviewInput;
      endFrameReference=review.endFrameReference;
    } catch(error) { reviewNote=`final video review unavailable: ${(error as Error).message}`; }
  }
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)").run(id,shotId,result.provenance.provider,result.provenance.model,"generate_final_video",result.provenance.prompt,result.media?.path ?? null,result.cost.usd,now);
  bindAttemptRevision(db,projectId,id,authorization);
  if (reviewInput || endFrameReference) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const sequence=Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
      db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'retain_review_media_input',?,?,?)")
        .run(randomUUID(),projectId,sequence,JSON.stringify({projectId,shotId,attemptId:id,reviewInput,endFrameReference}),`review-input:${id}`,Date.now());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  if (result.ambientAudio) {
    job?.progress({ phase: "reviewing_ambience", percentage: null, currentStep: null, totalSteps: null });
    const ambienceReview = await registerVideoAmbience(db, projectId, id, result);
    result.metadata = { ...result.metadata, ambienceReview };
    job?.progress({ phase: `ambience_${ambienceReview.status}`, percentage: null, currentStep: null, totalSteps: null, diagnostic: ambienceReview.reason });
  }
  job?.finish("completed",{attemptId:id,...result.metadata});
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),projectId,id,result.cost.usd,now);
  if (reviewCostUsd !== undefined) {
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),projectId,id,reviewCostUsd,Date.now());
  }
  const coverageNote=policy.additionalCoverage ? ` Additional source coverage: ${JSON.stringify(policy.additionalCoverage)}. Existing accepted take and clip remain retained; this candidate needs independent review.` : "";
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)").run(randomUUID(),projectId,shotId,`Final-video candidate ${id}. ${reviewNote} Risk ${risk.tier} (${risk.reasons.join("; ")}) -> ${tier} render. Cost policy: ${result.fallbackReason}${coverageNote}`,now);
  return {status:"candidate" as const,attemptId:id,reviewPassed,...(reviewInput?{reviewInput}:{}),...(endFrameReference?{endFrameReference}:{})};
}

function redactCharacterNames(text:string,names:string[]) {
  let result=text;
  for(const name of names.filter(Boolean).sort((a,b)=>b.length-a.length)) {
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    result=result.replace(new RegExp(`\\b${escaped}\\b`,"gi"),/jesus/i.test(name)?"the central teacher":"a follower");
  }
  return result;
}

export function acceptFinalVideoCandidate(db:DatabaseSync, projectId:string, attemptId:string, durationMs:number) {
  if (!Number.isInteger(durationMs)||durationMs<1) throw new Error("A verified positive video duration is required.");
  const row=db.prepare(`SELECT ga.shot_id,ga.status,ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE ga.id=? AND s.project_id=? AND ga.operation='generate_final_video' AND sh.needs_lip_sync=0`).get(attemptId,projectId) as {shot_id:string;status:string;result_asset_path:string|null}|undefined;
  if (!row?.result_asset_path) throw new Error("Final-video candidate is not retained in this project.");
  const old=db.prepare("SELECT id FROM clips WHERE generation_attempt_id=?").get(attemptId) as {id:string}|undefined; if(old)return {clipId:old.id,reused:true};
  if(row.status!=="hold_for_review"&&row.status!=="accepted")throw new Error("Only a held final-video candidate can be accepted.");
  const id=randomUUID(); db.exec("BEGIN IMMEDIATE"); try { validateAttemptRevision(db,getDataDir(),projectId,attemptId); db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'").run(attemptId); db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)").run(id,row.shot_id,attemptId,durationMs,Date.now()); db.exec("COMMIT"); }catch(e){db.exec("ROLLBACK");throw e;} return {clipId:id,reused:false};
}

/** Select a reviewed interior interval without approving the rejected rest.
 * The provider attempt stays immutable; a separately identified local trim is
 * accepted with exact frame hashes and parent lineage, never as new generation.
 * Restricted to silent-picture coverage: speech bindings are not retimed. */
export function selectFinalVideoRange(db:DatabaseSync,projectId:string,parentId:string,
  range:{startFrame:number;endFrameExclusive:number;crop?:{x:number;y:number;width:number;height:number}},review:{reviewer:string;evidence:string},dataDir=getDataDir()) {
  if(!Number.isSafeInteger(range.startFrame)||!Number.isSafeInteger(range.endFrameExclusive)||range.startFrame<0||range.endFrameExclusive<=range.startFrame||!review.reviewer.trim()||!review.evidence.trim())throw Error("Exact positive frame range and named review evidence required.");
  const crop=range.crop;
  if(crop!==undefined&&(!crop||![crop.x,crop.y,crop.width,crop.height].every(n=>Number.isSafeInteger(n)&&n%2===0)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0))throw Error("Reviewed crop requires even non-negative pixel coordinates and positive even dimensions.");
  const selection={startFrame:range.startFrame,endFrameExclusive:range.endFrameExclusive,...(crop?{crop:{x:crop.x,y:crop.y,width:crop.width,height:crop.height}}:{})};
  const row=db.prepare(`SELECT ga.shot_id,ga.status,ga.result_asset_path FROM generation_attempts ga
    JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    WHERE ga.id=? AND sc.project_id=? AND ga.operation='generate_final_video' AND sh.needs_lip_sync=0`).get(parentId,projectId) as {shot_id:string;status:string;result_asset_path:string|null}|undefined;
  if(!row?.result_asset_path||!["hold_for_review","accepted"].includes(row.status))throw Error("Retained current non-speaking final candidate required.");
  validateAttemptRevision(db,dataDir,projectId,parentId);const auth=productionAuthorization(db,dataDir,projectId);
  const source=productionAssetPath(dataDir,row.result_asset_path),hash=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex"),sourceSha256=hash(source),key=`final-video-range:${parentId}:${range.startFrame}:${range.endFrameExclusive}${crop?`:crop:${crop.x}:${crop.y}:${crop.width}:${crop.height}`:""}`;
  const old=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId,key);
  if(old){const saved=JSON.parse(String(old.payload));validateAttemptRevision(db,dataDir,projectId,saved.attemptId);if(saved.sourceSha256!==sourceSha256||hash(productionAssetPath(dataDir,saved.path))!==saved.sha256||!db.prepare("SELECT id FROM clips WHERE id=? AND generation_attempt_id=?").get(saved.clipId,saved.attemptId))throw Error("Retained range media or lineage changed.");return {...saved,reused:true};}
  const probe=(p:string)=>JSON.parse(execFileSync("ffprobe",["-v","error","-count_frames","-show_streams","-of","json",p],{encoding:"utf8",windowsHide:true}));
  const original=probe(source).streams.find((s:any)=>s.codec_type==="video"),parts=String(original?.avg_frame_rate).split("/").map(Number),fps=parts[0]!/parts[1]!;
  if(!original||!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(Number(original.nb_read_frames))||range.endFrameExclusive>Number(original.nb_read_frames))throw Error("Frame range exceeds actual decoded source.");
  if(crop&&(crop.x+crop.width>original.width||crop.y+crop.height>original.height))throw Error("Reviewed crop exceeds actual decoded source geometry.");
  const id=randomUUID(),path=join("generated","video-ranges",`${id}.mp4`),output=productionAssetPath(dataDir,path),provenancePath=output+".json",count=range.endFrameExclusive-range.startFrame,filter=`trim=start_frame=${range.startFrame}:end_frame=${range.endFrameExclusive},setpts=PTS-STARTPTS${crop?`,crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`:""}`;
  mkdirSync(join(dataDir,"assets","generated","video-ranges"),{recursive:true});
  execFileSync("ffmpeg",["-v","error","-nostdin","-n","-i",source,"-map","0:v:0","-an","-vf",filter,"-fps_mode","passthrough","-c:v","libx264","-qp","0",output],{windowsHide:true,stdio:"pipe"});
  const rendered=probe(output),video=rendered.streams[0];if(rendered.streams.length!==1||video.codec_type!=="video"||Number(video.nb_read_frames)!==count||video.width!==(crop?.width??original.width)||video.height!==(crop?.height??original.height)||video.avg_frame_rate!==original.avg_frame_rate)throw Error("Selected range changed reviewed geometry, frame count or rate.");
  const frameHashes=(p:string,vf?:string)=>execFileSync("ffmpeg",["-v","error","-nostdin","-i",p,"-map","0:v:0","-an",...(vf?["-vf",vf]:[]),"-f","framemd5","-"],{encoding:"utf8",windowsHide:true,maxBuffer:32*1024*1024}).split(/\r?\n/).filter(l=>l&&!l.startsWith("#")).map(l=>l.split(",").at(-1)!.trim());
  const expected=frameHashes(source,filter),actual=frameHashes(output);if(expected.length!==count||JSON.stringify(expected)!==JSON.stringify(actual)||hash(source)!==sourceSha256)throw Error("Selected decoded pixels do not match the exact original frame range.");
  auth.assertCurrent();validateAttemptRevision(db,dataDir,projectId,parentId);
  const clipId=randomUUID(),durationMs=Math.round(count*1000/fps),proof={version:crop?2:1,kind:"reviewed_native_frame_range",parentAttemptId:parentId,sourcePath:row.result_asset_path,sourceSha256,range:selection,...(crop?{sourceGeometry:{width:original.width,height:original.height},selectedGeometry:{width:crop.width,height:crop.height},acceptanceScope:"Only the reviewed rectangle and frame interval; excluded pixels and the parent are not approved."}:{}),fps,frames:count,durationMs,exactNativeDurationMs:count*1000/fps,path,sha256:hash(output),review,decodedFrameHashes:actual,sourceUnchanged:true,nativeAudioExcluded:true,newProviderCalls:0};
  writeFileSync(provenancePath,JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
  const saved={attemptId:id,clipId,projectId,shotId:row.shot_id,parentAttemptId:parentId,sourceSha256,path,sha256:proof.sha256,range:selection,durationMs,provenancePath:join("generated","video-ranges",`${id}.mp4.json`),review};
  db.exec("BEGIN IMMEDIATE");try{
    auth.assertCurrent();
    db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,'ffmpeg','native_frame_range','trim_final_video',?,'accepted',?,0,?)").run(id,row.shot_id,JSON.stringify({parentAttemptId:parentId,range:selection,review}),path,Date.now());
    bindAttemptRevision(db,projectId,id,auth);
    db.prepare("INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES(?,?,?,0,?,?)").run(clipId,row.shot_id,id,durationMs,Date.now());
    db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)").run(randomUUID(),projectId,id,Date.now());
    const seq=Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'select_final_video_range',?,?,?)").run(randomUUID(),projectId,seq,JSON.stringify(saved),key,Date.now());
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
  return {...saved,reused:false};
}
