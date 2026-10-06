import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import type { GenerationProgress, VideoTier } from "../../providers/types.js";
import type { VideoProviders } from "../../providers/video-selection.js";
import { reviewGeneratedVideo, videoReviewPassed } from "../qc/video-review.js";
import { generateSelectedFinalVideo } from "./select-final-video.js";
import { beginVideoJob } from "./video-job-status.js";
import { shotRiskFor, tierForRisk } from "./shot-risk-lookup.js";
import { registerVideoAmbience } from "../assembly/soundtrack.js";

export async function generateNonSpeakingVideoCandidate(db:DatabaseSync, projectId:string, shotId:string, providers:VideoProviders, policy:{allowDraftFallback?:boolean}={}) {
  const shot=db.prepare(`SELECT sh.id,sh.action FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE sh.id=? AND s.project_id=? AND sh.needs_lip_sync=0`).get(shotId,projectId) as {id:string;action:string}|undefined;
  if (!shot) throw new Error("Only a non-speaking shot in this project can receive ordinary final video.");
  const selected=db.prepare(`SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    JOIN shots sh ON sh.id=c.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    LEFT JOIN project_restart_cutovers cutover ON cutover.project_id=sc.project_id
    WHERE c.shot_id=? AND ga.status='accepted' AND (cutover.started_at IS NULL OR ga.created_at>=cutover.started_at)`).get(shotId) as {id:string}|undefined;
  if (selected) return {status:"reused" as const,clipId:selected.id};
  const prior=db.prepare(`SELECT ga.id,ga.status,ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    LEFT JOIN project_restart_cutovers cutover ON cutover.project_id=sc.project_id
    WHERE ga.shot_id=? AND ga.operation='generate_final_video' AND ga.status!='retry_modified'
      AND (cutover.started_at IS NULL OR ga.created_at>=cutover.started_at)
    ORDER BY ga.created_at DESC LIMIT 1`).get(shotId) as {id:string;status:string;result_asset_path:string|null}|undefined;
  if (prior) return {status:"held" as const,attemptId:prior.id,reason:`Existing final-video candidate is ${prior.status}; reconcile or review it before another request.`};
  const local = providers.primaryBackend === "ltx";
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
  const job = local ? beginVideoJob(db,projectId,shotId,"ltx") : undefined;
  let submitted = false;
  let result;
  try {
    result = await generateSelectedFinalVideo(providers,{shotId,prompt,characters:[]},{resolution:"720p",startFrame:{path:keyframe.result_asset_path},durationSeconds:8,tier,allowKlingSceneFallback:false,allowDraftFallback:policy.allowDraftFallback,onProgress:(progress:GenerationProgress) => { if(progress.phase === "submitted") submitted = true; job?.progress(progress); }});
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
  if(result.media?.path) {
    try {
      const review=await reviewGeneratedVideo({videoPath:join(getDataDir(),"assets",result.media.path),keyframePath:join(getDataDir(),"assets",keyframe.result_asset_path),instruction:prompt});
      reviewPassed=videoReviewPassed(review.verdict);
      reviewNote=`${reviewPassed?"passed":"FAILED"} final video review (confidence ${review.verdict.confidence}): ${review.verdict.reason}`;
      reviewCostUsd=review.costUsd;
    } catch(error) { reviewNote=`final video review unavailable: ${(error as Error).message}`; }
  }
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)").run(id,shotId,result.provenance.provider,result.provenance.model,"generate_final_video",result.provenance.prompt,result.media?.path ?? null,result.cost.usd,now);
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
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)").run(randomUUID(),projectId,shotId,`Final-video candidate ${id}. ${reviewNote} Risk ${risk.tier} (${risk.reasons.join("; ")}) -> ${tier} render. Cost policy: ${result.fallbackReason}`,now);
  return {status:"candidate" as const,attemptId:id,reviewPassed};
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
  const id=randomUUID(); db.exec("BEGIN IMMEDIATE"); try { db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'").run(attemptId); db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)").run(id,row.shot_id,attemptId,durationMs,Date.now()); db.exec("COMMIT"); }catch(e){db.exec("ROLLBACK");throw e;} return {clipId:id,reused:false};
}
