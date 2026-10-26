import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { assertEditionInputsCurrent, editionPlanIsOrderOnlySuccessor, readLanguageEditionOrigin, readLanguageEditionPlan } from "./language-edition.js";
import { readConfirmedSpeechRuns } from "./ingestion/continuous-speech.js";
import { hasCurrentSourceReview } from "./ingestion/source-review.js";
import { VOICE_CHANGER_DEFAULTS, type ReVoiceResult } from "../providers/elevenlabs.js";

const hash=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
type Original={id:string;source_path:string;start_ms:number;end_ms:number;speaker_character_id:string|null};
type Cast={source_path:string;source_hash:string;voice_version_id:string|null};
export type AuditionEvidence={projectId:string;planHash:string;sourceSegmentIds:string[];sourceSha256:string;
  castSha256:string;sidecarSha256:string;voiceId:string;voiceVersionId:string;requestSettings:ReVoiceResult["requestSettings"]};

/** One reviewed speech interval (or complete short speech run), never a chapter-wide paid audition. */
export function validateEditionAuditionScope(db:DatabaseSync,dataDir:string,projectId:string,ids:readonly string[]):void{
  if(!readLanguageEditionOrigin(db,projectId))throw new Error("A language edition is required.");
  if(!readLanguageEditionPlan(db,projectId)?.revision)throw new Error("Review exact target correspondence before a paid audition.");
  if(!hasCurrentSourceReview(db,projectId,dataDir))throw new Error("Review the current target Scripture and audio alignment before a paid audition.");
  const unique=[...new Set(ids)];
  if(!unique.length||unique.length>8)throw new Error("Select one short target speech interval or one complete short speech run.");
  const rows=db.prepare(`SELECT id,source_path,start_ms,end_ms,speaker_character_id FROM audio_segments
    WHERE project_id=? AND layer='original_reading' AND id IN (${unique.map(()=>"?").join(",")}) ORDER BY start_ms`).all(projectId,...unique) as Original[];
  if(rows.length!==unique.length||!rows[0]?.speaker_character_id||rows.some(row=>row.speaker_character_id!==rows[0]!.speaker_character_id || row.source_path!==rows[0]!.source_path))
    throw new Error("The audition must be one target speaker in one source recording.");
  for(let i=1;i<rows.length;i++)if(rows[i]!.start_ms!==rows[i-1]!.end_ms)throw new Error("Audition speech intervals must be contiguous.");
  const duration=rows.at(-1)!.end_ms-rows[0]!.start_ms;
  if(duration<2000||duration>15000)throw new Error("Choose a complete 2–15 second target-language speech sample.");
  const runs=readConfirmedSpeechRuns(db,projectId,dataDir);
  for(const run of runs)if(run.members.some(member=>unique.includes(member.id)) &&
      (run.members.length!==unique.length||run.members.some(member=>!unique.includes(member.id))))
    throw new Error("The audition must include the complete confirmed speech run.");
}

/** A cast candidate can be approved only after local evidence proves its source, voice and settings. */
export function editionAuditionEvidence(db:DatabaseSync,dataDir:string,projectId:string,ids:readonly string[]):AuditionEvidence{
  assertEditionInputsCurrent(db,dataDir,projectId);
  validateEditionAuditionScope(db,dataDir,projectId,ids);
  const origin=readLanguageEditionOrigin(db,projectId)!;
  const plan=readLanguageEditionPlan(db,projectId);
  if(!plan?.revision)throw new Error("Review target-language correspondence before approving a voice audition.");
  const segments=db.prepare(`SELECT id,source_path,start_ms,end_ms,speaker_character_id FROM audio_segments
    WHERE project_id=? AND layer='original_reading' AND id IN (${ids.map(()=>"?").join(",")}) ORDER BY start_ms`).all(projectId,...ids) as Original[];
  const voice=origin.preflight.voices.find(item=>item.characterId===segments[0]!.speaker_character_id);
  if(!voice)throw new Error("Audition speaker has no pinned approved character voice.");
  const cast=db.prepare(`SELECT a.source_path,m.source_hash,m.voice_version_id FROM composite_audio_source_map m
    JOIN audio_segments a ON a.id=m.composite_segment_id WHERE a.project_id=? AND m.original_segment_id=?`).get(projectId,segments[0]!.id) as Cast|undefined;
  if(!cast||cast.voice_version_id!==voice.versionId)throw new Error("The chosen audition has no cast master for its pinned voice.");
  const source=resolve(dataDir,"assets",segments[0]!.source_path),master=resolve(dataDir,"assets",cast.source_path),sidecar=`${master}.json`;
  if(!existsSync(source)||!existsSync(master)||!existsSync(sidecar))throw new Error("Retained audition source, cast audio or voice sidecar is missing.");
  const sourceSha256=hash(readFileSync(source));
  if(cast.source_hash!==sourceSha256)throw new Error("Retained audition cast source hash changed.");
  for(const segment of segments.slice(1)){
    const member=db.prepare(`SELECT a.source_path,m.source_hash,m.voice_version_id FROM composite_audio_source_map m
      JOIN audio_segments a ON a.id=m.composite_segment_id WHERE a.project_id=? AND m.original_segment_id=?`).get(projectId,segment.id) as Cast|undefined;
    if(!member||member.source_path!==cast.source_path||member.source_hash!==sourceSha256||member.voice_version_id!==voice.versionId)
      throw new Error("The complete speech run does not share one proven cast master.");
  }
  const sidecarBytes=readFileSync(sidecar),settings=JSON.parse(sidecarBytes.toString("utf8")) as {voiceId?:string;voiceVersionId?:string;requestSettings?:ReVoiceResult["requestSettings"];
    sourceStartMs?:number;sourceEndMs?:number;originalSegmentId?:string;members?:Array<{id:string}>};
  const currentSettings=settings.requestSettings;
  if(!currentSettings || currentSettings.model_id!==VOICE_CHANGER_DEFAULTS.model_id ||
      currentSettings.remove_background_noise!==VOICE_CHANGER_DEFAULTS.remove_background_noise ||
      currentSettings.output_format!==VOICE_CHANGER_DEFAULTS.output_format)
    throw new Error("Retained audition sidecar lacks explicit current ElevenLabs model and output settings.");
  if(settings.voiceId!==voice.voiceId||settings.voiceVersionId!==voice.versionId||
      (voice.effectiveSettings!==null && JSON.stringify(currentSettings)!==JSON.stringify(voice.effectiveSettings))||
      settings.sourceStartMs!==segments[0]!.start_ms||settings.sourceEndMs!==segments.at(-1)!.end_ms||
      (segments.length===1 ? settings.originalSegmentId!==segments[0]!.id :
        settings.members?.length!==segments.length||segments.some(segment=>!settings.members?.some(member=>member.id===segment.id))))
    throw new Error("Retained audition sidecar does not prove the exact source window and pinned voice settings.");
  return {projectId,planHash:plan.hash,sourceSegmentIds:segments.map(item=>item.id),sourceSha256,
    castSha256:hash(readFileSync(master)),sidecarSha256:hash(sidecarBytes),voiceId:voice.voiceId,voiceVersionId:voice.versionId,
    requestSettings:currentSettings};
}

export function approveEditionVoiceAudition(db:DatabaseSync,dataDir:string,projectId:string,input:{sourceSegmentIds:string[];reviewer:string;evidence:string}){
  if(!input?.reviewer?.trim()||!input.evidence?.trim())throw new Error("A named target-language listener and review evidence are required.");
  const proof=editionAuditionEvidence(db,dataDir,projectId,input.sourceSegmentIds);
  const existing=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='approve_edition_voice_audition' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}|undefined;
  if(existing){const prior=JSON.parse(existing.payload) as typeof proof & {reviewer:string;evidence:string};
    if(JSON.stringify(proof)===JSON.stringify(Object.fromEntries(Object.entries(prior).filter(([key])=>key!=="reviewer"&&key!=="evidence"))) &&
        prior.reviewer===input.reviewer.trim()&&prior.evidence===input.evidence.trim())return prior;
    throw new Error("A different voice audition is already approved; reconcile it before replacement.");
  }
  const payload={...proof,reviewer:input.reviewer.trim(),evidence:input.evidence.trim()};
  db.exec("BEGIN IMMEDIATE");try{
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'approve_edition_voice_audition',?,?,?)")
      .run(randomUUID(),projectId,sequence,JSON.stringify(payload),`language-edition:${projectId}:voice-audition`,Date.now());
    db.exec("COMMIT");return payload;
  }catch(error){db.exec("ROLLBACK");throw error;}
}

export function assertEditionVoiceAuditionApproved(db:DatabaseSync,dataDir:string,projectId:string):AuditionEvidence{
  const row=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='approve_edition_voice_audition' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}|undefined;
  if(!row)throw new Error("Full target-language voicing is held until a short Meyah voice audition is heard and approved.");
  const saved=JSON.parse(row.payload) as AuditionEvidence & {reviewer:string;evidence:string};
  const current=editionAuditionEvidence(db,dataDir,projectId,saved.sourceSegmentIds);
  for(const key of Object.keys(current) as Array<keyof AuditionEvidence>)if(
    key==="planHash" ? !editionPlanIsOrderOnlySuccessor(db,projectId,saved.planHash) :
    JSON.stringify(current[key])!==JSON.stringify(saved[key]))
    throw new Error("Approved voice audition is stale after a source, cast, voice or plan change.");
  return current;
}
