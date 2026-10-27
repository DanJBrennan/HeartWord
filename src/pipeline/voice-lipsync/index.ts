/** Stage 5 owns the complete cast master and speaking-picture treatment.
 * Narration is never sent to lip-sync: only an on-camera, cast speaker with
 * an approved voice, accepted keyframe, and aligned source segment is eligible. */
import { randomUUID } from "node:crypto";
import { getDb, getDataDir } from "../../db/client.js";
import { productionAuthorization, bindAttemptRevision, validateAttemptRevision } from "../creative-direction/crew-store.js";
import { KlingLipSyncProvider } from "../../providers/kling/index.js";
import { runVoicing } from "../voicing/index.js";
import type { StageResult } from "../types.js";
import { resolveSpeechRunCastAudio } from "./speech-run-audio.js";
import { checkAvatarSpend,readPerformanceDirection,reserveAvatarSpend,settleAvatarSpend } from "./performance-direction.js";
import { AVATAR_RESERVATION_RATE_USD } from "../../providers/kling/avatar-direction.js";
import { assertEditionInputsCurrent, editionSpeakingDonorKeyframe, readLanguageEditionOrigin } from "../language-edition.js";

type ReadyShot = { id: string; verse_ref: string | null; dialogue_character_id: string; keyframe: string | null; voice_id: string | null; version_id: string | null; locked_visual_facts:string|null; binding_id:string|null; source_segment_id:string|null; start_ms:number|null; end_ms:number|null; source_hash:string|null };
export const runVoiceLipSync = (projectId:string,onlyShotIds?:readonly string[]):Promise<StageResult> => observeWork(projectId, "voice_lipsync", () => runVoiceLipSyncImpl(projectId,onlyShotIds));
const runVoiceLipSyncImpl = async (projectId:string,onlyShotIds?:readonly string[]):Promise<StageResult> => {
  const db = getDb();
  const edition=readLanguageEditionOrigin(db,projectId);
  if(edition)try{assertEditionInputsCurrent(db,getDataDir(),projectId);}catch(error){return {ok:false,reasoning:(error as Error).message};}
  const allShots = db.prepare(`SELECT sh.id,sh.verse_ref,sh.dialogue_character_id,
    (SELECT result_asset_path FROM generation_attempts WHERE shot_id=sh.id AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1) keyframe,
    (SELECT cv.voice_id FROM character_versions cv WHERE cv.id=ub.character_version_id AND cv.character_id=sh.dialogue_character_id AND cv.status='approved') voice_id,
    (SELECT cv.id FROM character_versions cv WHERE cv.id=ub.character_version_id AND cv.character_id=sh.dialogue_character_id AND cv.status='approved') version_id,
    (SELECT cv.locked_visual_facts FROM character_versions cv WHERE cv.id=ub.character_version_id AND cv.status='approved') locked_visual_facts,
    ub.id binding_id,ub.source_audio_segment_id source_segment_id,ub.source_start_ms start_ms,ub.source_end_ms end_ms,ub.source_hash source_hash
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id LEFT JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
    WHERE sc.project_id=? AND sh.needs_lip_sync=1`).all(projectId) as unknown as ReadyShot[];
  const scope=onlyShotIds ? new Set(onlyShotIds) : null;
  if(scope && (!scope.size || [...scope].some(id=>!allShots.some(s=>s.id===id))))return {ok:false,reasoning:"Scoped lip-sync needs speaking shots belonging to this chapter; no voice or video request was sent."};
  const shots=scope ? allShots.filter(s=>scope.has(s.id)) : allShots;
  if (!shots.length) return { ok: true, reasoning: "No on-camera speech is planned; narration remains unsynchronised as required." };
  if(edition)try{
    for(const shot of shots)if(!shot.keyframe){
      const donor=editionSpeakingDonorKeyframe(db,getDataDir(),projectId,shot.id);
      if(donor)shot.keyframe=donor.path;
    }
  }catch(error){return {ok:false,reasoning:(error as Error).message};}
  const missing = shots.filter(s => !s.keyframe || !s.voice_id || !s.version_id || !s.binding_id || !s.source_segment_id || s.start_ms===null || s.end_ms===null);
  if (missing.length) return { ok: false, reasoning: `Voice/lip-sync is held for ${missing.length} speaking shot(s): each needs an accepted keyframe, approved speaking voice, and producer-approved exact utterance binding. Voicing and provider calls were not started.` };
  // Validate the saved direction for the entire batch before any paid voicing.
  const directions = new Map();
  try { for (const shot of shots) directions.set(shot.id,readPerformanceDirection(db,projectId,shot.id)); }
  catch (error) { return {ok:false,reasoning:(error as Error).message}; }
  const pendingShots=shots.filter(shot=>!db.prepare(`SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE ga.shot_id=? AND ga.operation='lip_sync' AND ga.status='accepted'`).get(shot.id));
  if(edition)for(const shot of shots.filter(item=>!pendingShots.includes(item))){
    const accepted=db.prepare(`SELECT ga.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE ga.shot_id=? AND ga.operation='lip_sync' AND ga.status='accepted'`).get(shot.id) as {id:string}|undefined;
    if(!accepted || !db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId,`production-revision:${accepted.id}`))
      return {ok:false,reasoning:`Accepted edition Avatar take for ${shot.id} lacks its pinned production revision.`};
    try{validateAttemptRevision(db,getDataDir(),projectId,accepted.id);}catch(error){return {ok:false,reasoning:(error as Error).message};}
  }
  for(const shot of pendingShots){
    const prior=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot.id);
    if(prior)return {ok:false,reasoning:`Lip-sync candidate ${prior.id} is retained for ${shot.id}; resolve its existing review before new spending.`};
  }
  if(pendingShots.length)try { productionAuthorization(db,getDataDir(),projectId); checkAvatarSpend(db,projectId,0); }catch(error){return {ok:false,reasoning:(error as Error).message};}
  // Only after every speaking shot has safe, explicit source identity may the
  // stage build/reuse the cast master (which can involve paid re-voicing).
  const master = await runVoicing(projectId);
  if (!master.ok) return master;
  const sync = new KlingLipSyncProvider(); let made = 0;
  for (const shot of shots) {
    const visible = (db.prepare(`SELECT COUNT(*) count FROM shot_characters WHERE shot_id=?`).get(shot.id) as { count: number }).count;
    if (visible !== 1) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held for ${shot.id}: the generic Kling Avatar treatment can animate every detected face and is unsafe for an ensemble. Use the reviewed face-targeted treatment before submission.` };
    // Do not let the first line by a recurring speaker stand in for a later
    // one. Stage 3's verse binding is the stable cross-stage identity.
    const matching = db.prepare(`SELECT a.source_path,a.start_ms,a.end_ms,m.source_hash,m.voice_version_id,o.start_ms original_start,o.end_ms original_end FROM audio_segments a JOIN composite_audio_source_map m ON m.composite_segment_id=a.id JOIN audio_segments o ON o.id=m.original_segment_id WHERE a.project_id=? AND a.layer='composite_cast_master' AND m.original_segment_id=?`).all(projectId,shot.source_segment_id) as Array<{source_path:string;start_ms:number;end_ms:number;source_hash:string;voice_version_id:string|null;original_start:number;original_end:number}>;
    // A verse may contain several utterances by one character.  A verse
    // reference alone is not an utterance identity, so choosing the first
    // one would put real speech on the wrong mouth.  Hold until casting has
    // persisted a narrower interval/utterance binding.
    let audio: { path: string; startMs: number; endMs: number };
    try {
      const continuous = resolveSpeechRunCastAudio(db, shot.id, shot.version_id!);
      if (continuous) audio = continuous;
      else {
        if (matching.length !== 1 || matching[0]?.source_hash !== shot.source_hash || matching[0]?.voice_version_id !== shot.version_id) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held: speaking shot ${shot.id} lacks a current composite segment matching its approved source and voice-version binding.` };
        const full = matching[0]!;
        const scale=(full.end_ms-full.start_ms)/(full.original_end-full.original_start);
        audio={path:full.source_path,startMs:full.start_ms+Math.round((shot.start_ms!-full.original_start)*scale),endMs:full.start_ms+Math.round((shot.end_ms!-full.original_start)*scale)};
      }
    } catch (error) { return { ok: false, reasoning: (error as Error).message }; }
    const selected = db.prepare(`SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE ga.shot_id=? AND ga.operation='lip_sync' AND ga.status='accepted'`).get(shot.id) as {id:string}|undefined;
    if (selected) continue;
    const prior = db.prepare(`SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' ORDER BY created_at DESC LIMIT 1`).get(shot.id) as { id:string; status:string } | undefined;
    if (prior) return { ok: false, reasoning: `${master.reasoning} Voice/lip-sync is held: shot ${shot.id} already has retained lip-sync candidate ${prior.id} (${prior.status}); review or explicitly supersede it before another paid request.` };
    const upperBoundUsd=Math.ceil(Math.max(2000,audio.endMs-audio.startMs)/1000)*AVATAR_RESERVATION_RATE_USD;
    let reservationId:string;
    let authorization:ReturnType<typeof productionAuthorization>;
    try { authorization=productionAuthorization(db,getDataDir(),projectId); }
    catch(error){return {ok:false,reasoning:(error as Error).message};}
    try { reservationId=reserveAvatarSpend(db,projectId,shot.id,upperBoundUsd); }
    catch(error){return {ok:false,reasoning:(error as Error).message};}
    // Lost/rejected responses leave their reservation outstanding. No implicit
    // retry or debit-to-zero; the next run holds for reconciliation.
    let result;
    try { authorization.assertCurrent(); result = await sync.sync({ characterId: shot.dialogue_character_id, characterVersionId: shot.version_id!,lockedVisualFacts:shot.locked_visual_facts ? JSON.parse(shot.locked_visual_facts) : undefined }, audio, { path: shot.keyframe! }, {avatarDirection:directions.get(shot.id),requestId:reservationId,authorizeSubmission:authorization.assertCurrent,productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash}}); }
    catch(error){return {ok:false,reasoning:`Avatar request remains outstanding (${reservationId}): ${(error as Error).message}`};}
    if (!result.media) return { ok: false, reasoning: `Lip-sync provider returned no media for ${shot.id}; no clip was selected.` };
    const now = Date.now(), attempt = randomUUID();
    // A provider completion is evidence, never producer approval.  Keep the
    // candidate and cost, but do not create a timeline clip until the
    // producer accepts this particular attempt.
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,?,'hold_for_review',?,?,?)`).run(attempt, shot.id, result.provenance.provider, result.provenance.model, "lip_sync", result.provenance.prompt,result.media.path, result.cost.usd, now);
      db.prepare(`INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)`).run(randomUUID(), projectId, attempt, result.cost.usd, now);
      settleAvatarSpend(db,projectId,reservationId,attempt);
      bindAttemptRevision(db,projectId,attempt,authorization);
      db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)`).run(randomUUID(), projectId, shot.id, `Lip-sync candidate ${attempt} returned by ${result.provenance.provider}; producer review is required before it can become a clip.`, now);
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
    made++;
  }
  return made === 0 ? { ok: true, reasoning: `${master.reasoning} Every speaking treatment already has an accepted selected clip; narration was not lip-synced.` } : { ok: false, reasoning: `${master.reasoning} Recorded ${made} speaking lip-sync candidate(s), all held for producer review; narration was not lip-synced.` };
};
import { observeWork } from "../observed-work.js";
