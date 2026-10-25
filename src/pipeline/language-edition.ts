import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { discoverSourcePaths } from "./ingestion/source-catalog.js";
import { parseReferenceOnlyVerseMarkers, parseSourceTextByVerse } from "./ingestion/parse-source-text.js";
import { VOICE_CHANGER_DEFAULTS, type ReVoiceResult } from "../providers/elevenlabs.js";
import { readConfirmedSpeechRuns } from "./ingestion/continuous-speech.js";

type Project = { id: string; language: string; book: string; chapter: number; updated_at: number };
type Render = { id: string; project_id: string; result_asset_path: string; total_duration_ms:number; timeline_json: string | null; source_audio_json: string | null };
type Voice = { characterId: string; versionId: string; voiceId: string; voiceProvider: string; approvedBy: string; approvedAt: number;
  effectiveSettings: ReVoiceResult["requestSettings"]; voiceEvidence:{path:string;sha256:string};visualAssets: Array<{ id: string; path: string; sha256: string }> };
export interface EditionTitle { bookChapter: string; languageName: string; authority: string; durationMs: number; profile: "mark4-serif-over-establishing"; backgroundFramePath:string }
export interface EditionRequest { renderId: string; targetLanguage: string; title: EditionTitle }
export interface EditionPreflight {
  status: "ready" | "held"; holds: string[]; sourceQuestions: string[]; fingerprint: string | null;
  donor: { projectId: string; renderId: string; renderPath:string|null;approvalId:string|null; renderSha256: string | null; timelineSha256: string | null; sourceAudioSha256: string | null; revision: number };
  target: { language: string; book: string; chapter: number; audio: { path: string; sha256: string } | null; text: { path: string; sha256: string } | null; reference: { path: string; sha256: string } | null; titleBackground:{path:string;sha256:string}|null; title: EditionTitle };
  voices: Voice[]; sourceAudioEvidence:Array<{path:string;sha256:string}>;pictureEvidence:Array<{shotId:string;clipId:string;attemptId:string;path:string;sha256:string;keyframePath:string;keyframeSha256:string;sourceStartMs:number;durationMs:number}>;
  estimate: { newSpeakingPictures: number | null; reuseCandidates: number | null; costUsd: null };
}

const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function asset(dataDir: string, path: string): { path: string; sha256: string } {
  const root = resolve(dataDir,"assets"), full = isAbsolute(path) ? resolve(path) : resolve(root,path);
  const rel = relative(root,full);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !existsSync(full)) throw new Error("Required chapter asset is unavailable inside the selected data root.");
  return { path: rel.replaceAll("\\","/"), sha256: sha(readFileSync(full)) };
}
function validateTitle(source: Project, input: EditionRequest): string[] {
  const errors: string[] = [], title = input.title;
  if (!title || typeof title.bookChapter !== "string" || typeof title.languageName !== "string" || typeof title.authority !== "string" ||
      !title.bookChapter.trim() || !title.languageName.trim() || !title.authority.trim() || !title.backgroundFramePath?.trim()) errors.push("Verified target-language title, language name, clean background and authority are required.");
  if (!title || title.profile !== "mark4-serif-over-establishing" || !Number.isInteger(title.durationMs) || title.durationMs < 1000 || title.durationMs > 12000)
    errors.push("A valid Mark 4 title treatment and approved hold are required.");
  if (source.book !== "mark") errors.push("Only the approved Mark language-edition workflow is enabled.");
  if (input.targetLanguage === "meyah" && source.chapter === 4 &&
      (title?.bookChapter !== "Markus 4" || title?.languageName !== "Meyah")) errors.push("Meyah Mark 4 requires the approved strings Markus 4 and Meyah.");
  if (input.targetLanguage === "meyah" && source.chapter === 4 && title?.durationMs !== 4000)
    errors.push("Meyah Mark 4 retains the approved four-second Mark 4 title hold.");
  if(input.targetLanguage==="meyah" && source.chapter===4 && title?.backgroundFramePath!=="generated/editorial/mark4-intro/establishing-r1.png")
    errors.push("Meyah Mark 4 uses the retained clean Mark 4 lake establishing frame, before donor title lettering.");
  if (input.targetLanguage === "sougb") errors.push("Sougb chapter text and native title metadata require producer verification before creation.");
  if (!new RegExp(`(?:^|\\s)${source.chapter}$`,"u").test(title?.bookChapter ?? "")) errors.push("The title chapter does not match the project chapter.");
  return errors;
}

/** Read-only selected-render and target-source check. No provider or DB writes. */
export function preflightLanguageEdition(db: DatabaseSync, dataDir: string, sourceProjectId: string, input: EditionRequest): EditionPreflight {
  const project = db.prepare("SELECT id,language,book,chapter,updated_at FROM projects WHERE id=?").get(sourceProjectId) as Project | undefined;
  if (!project) throw new Error("Source project not found.");
  if (!input || typeof input.renderId !== "string" || !input.renderId || typeof input.targetLanguage !== "string") throw new Error("Explicit donor render and target language are required.");
  const language = input.targetLanguage.trim().toLowerCase();
  const holds = validateTitle(project,{...input,targetLanguage:language}), sourceQuestions:string[]=[];
  if(project.language.toLowerCase()!=="hatam")holds.push("The first language-edition workflow requires an approved Hatam donor.");
  if (language !== "meyah" && language !== "sougb") holds.push("Only Meyah and Sougb are authorized for this language-edition workflow.");
  const render = db.prepare(`SELECT r.id,r.project_id,r.result_asset_path,r.total_duration_ms,m.timeline_json,m.source_audio_json
    FROM chapter_renders r LEFT JOIN chapter_render_manifests m ON m.render_id=r.id WHERE r.id=? AND r.project_id=?`).get(input.renderId,project.id) as Render | undefined;
  if (!render) throw new Error("Selected render does not belong to the source project.");
  const approval=db.prepare(`SELECT id FROM edit_commands WHERE project_id=? AND undone=0 AND command_type IN ('producer_decision','approve_render')
    AND json_valid(payload) AND json_extract(payload,'$.renderId')=? AND json_extract(payload,'$.decision')='approved' LIMIT 1`).get(project.id,render.id) as {id:string}|undefined;
  if (!approval) holds.push("The selected donor render has no retained producer approval tied to its exact render ID.");
  let renderFile: ReturnType<typeof asset> | null = null;
  try { renderFile = asset(dataDir,render.result_asset_path); } catch { holds.push("Selected donor film is unavailable or outside the chapter assets."); }
  let timeline: unknown = null, sourceAudio: unknown = null;
  try { timeline = JSON.parse(render.timeline_json ?? "null"); sourceAudio = JSON.parse(render.source_audio_json ?? "null"); } catch { /* held below */ }
  if (!Array.isArray(timeline) || !timeline.length) holds.push("The selected donor cut needs a complete normalized picture recipe on an isolated copy.");
  // The target recording supplies every spoken sample and its clock. Older final
  // cuts may retain only a mixed Hatam soundtrack recipe; pin those bytes for
  // provenance without requiring a reconstruction of obsolete donor audio.
  if (!sourceAudio || typeof sourceAudio !== "object" || (Array.isArray(sourceAudio) && !sourceAudio.length))
    holds.push("The selected donor cut has no retained soundtrack provenance.");
  const sourceAudioEvidence:EditionPreflight["sourceAudioEvidence"]=[];
  if(Array.isArray(sourceAudio)){
    let previousEnd=-1;
    for(const item of sourceAudio){
      if(!item || typeof item!=="object" || typeof item.segmentId!=="string" ||
          !Number.isInteger(item.startMs)||!Number.isInteger(item.endMs)||!Number.isInteger(item.sourceStartMs)||!Number.isInteger(item.sourceEndMs)||
          item.startMs<previousEnd || item.endMs<=item.startMs || item.endMs>render.total_duration_ms || item.sourceStartMs<0 || item.sourceEndMs-item.sourceStartMs!==item.endMs-item.startMs){
        holds.push("Donor source-audio placements have missing identity, overlap or changed speech speed.");break;}
      previousEnd=item.endMs;
      const segment=db.prepare("SELECT source_path FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(item.segmentId,project.id) as {source_path:string}|undefined;
      const path=segment?.source_path??item.sourcePath;
      if(typeof path!=="string" || !path){holds.push(`Donor audio placement ${item.segmentId} has no retained source-file identity.`);continue;}
      try{const file=asset(dataDir,path);
        if(item.sourceSha256 && item.sourceSha256!==file.sha256)throw new Error("changed audio");
        if(!sourceAudioEvidence.some(saved=>saved.path===file.path))sourceAudioEvidence.push(file);
      }catch{holds.push(`Donor audio placement ${item.segmentId} references a missing or changed source file.`);}
    }
  }
  const pictureEvidence:EditionPreflight["pictureEvidence"]=[];
  if(Array.isArray(timeline))for(const raw of timeline){
    if(!raw || typeof raw!=="object" || typeof raw.shotId!=="string")continue;
    if(typeof raw.path!=="string" || typeof raw.sha256!=="string" || !Number.isInteger(raw.startMs) || !Number.isInteger(raw.endMs) || raw.endMs<=raw.startMs || raw.endMs>render.total_duration_ms ||
        (raw.sourceStartMs!==undefined && (!Number.isInteger(raw.sourceStartMs)||raw.sourceStartMs<0))){holds.push(`Selected donor shot ${raw.shotId} lacks a complete exact picture stem, trim and hash.`);continue;}
    try{
      const picture=asset(dataDir,raw.path);
      if(picture.sha256!==raw.sha256 || picture.path===renderFile?.path)throw new Error("changed or mixed program");
      const operation=(db.prepare("SELECT sh.needs_lip_sync FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?").get(raw.shotId,project.id) as {needs_lip_sync:number}|undefined)?.needs_lip_sync===1?"lip_sync":"generate_final_video";
      const selected=db.prepare(`SELECT c.id AS clipId,ga.id AS attemptId FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
        JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
        WHERE ga.shot_id=? AND sc.project_id=? AND ga.operation=? AND ga.status='accepted' AND ga.result_asset_path=? LIMIT 1`)
        .get(raw.shotId,project.id,operation,picture.path) as {clipId:string;attemptId:string}|undefined;
      if(!selected)throw new Error("unlinked selected picture");
      const keyframe=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(raw.shotId) as {result_asset_path:string}|undefined;
      if(!keyframe)throw new Error("no accepted scene frame");
      const frame=asset(dataDir,keyframe.result_asset_path);
      pictureEvidence.push({shotId:raw.shotId,clipId:selected.clipId,attemptId:selected.attemptId,path:picture.path,sha256:picture.sha256,keyframePath:frame.path,keyframeSha256:frame.sha256,
        sourceStartMs:raw.sourceStartMs??0,durationMs:raw.endMs-raw.startMs});
    }catch{holds.push(`Selected donor shot ${raw.shotId} has changed picture bytes or lacks an accepted scene-specific keyframe.`);}
  }
  const selectedShotIds=Array.isArray(timeline)?[...new Set(timeline.flatMap(item=>typeof item?.shotId==="string"?[item.shotId]:[]))]:[];
  if(!selectedShotIds.length)holds.push("The selected donor picture has no retained shot identities.");
  let audio: ReturnType<typeof asset> | null = null, text: ReturnType<typeof asset> | null = null, reference: ReturnType<typeof asset> | null = null, titleBackground:ReturnType<typeof asset>|null=null;
  try{titleBackground=asset(dataDir,input.title.backgroundFramePath);}catch{holds.push("Clean target title background is unavailable in the managed chapter assets.");}
  try {
    const paths = discoverSourcePaths({language,book:project.book,chapter:project.chapter},"non_drama",dataDir);
    text = asset(dataDir,paths.docxPath); audio = asset(dataDir,paths.audioPath); reference = asset(dataDir,paths.referencePath);
    const verses=parseSourceTextByVerse(paths.docxPath);
    if (!verses.length) holds.push("Target chapter text has no recognizable numbered Scripture entries.");
    for(const marker of parseReferenceOnlyVerseMarkers(paths.docxPath))
      sourceQuestions.push(`Published entry ${marker.raw} has no supplied words; review whether the preceding verse and target recording cover this reference before approving alignment.`);
  } catch { holds.push("Verified target text, non-drama audio or reference is unavailable in the managed source catalog."); }
  const bindings = db.prepare(`SELECT DISTINCT cv.character_id AS characterId,cv.id AS versionId,cv.voice_id AS voiceId,
      cv.voice_provider AS voiceProvider,cv.status AS versionStatus,c.canon_status AS canonStatus,c.region,
      b.approved_by AS approvedBy,b.approved_at AS approvedAt,a.source_path AS castPath
    FROM shot_utterance_bindings b JOIN shots s ON s.id=b.shot_id JOIN scenes sc ON sc.id=s.scene_id
      JOIN character_versions cv ON cv.id=b.character_version_id JOIN characters c ON c.id=cv.character_id
      LEFT JOIN composite_audio_source_map m ON m.original_segment_id=b.source_audio_segment_id AND m.voice_version_id=cv.id
      LEFT JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=sc.project_id
    WHERE sc.project_id=? AND s.id IN (${selectedShotIds.map(()=>"?").join(",")||"NULL"}) ORDER BY cv.character_id,cv.id`).all(project.id,...selectedShotIds) as Array<Omit<Voice,"visualAssets"|"effectiveSettings"|"voiceEvidence"> & {versionStatus:string;canonStatus:string;region:string;castPath:string|null}>;
  const voices: Voice[] = [];
  for (const binding of bindings) {
    if (!binding.voiceId || binding.voiceProvider !== "elevenlabs" || binding.versionStatus!=="approved" || binding.canonStatus!=="approved" || binding.region!=="Papuan" || !binding.approvedBy?.trim() || !binding.approvedAt) { holds.push(`Approved Papuan ElevenLabs identity and exact utterance review are unavailable for character ${binding.characterId}.`); continue; }
    let voiceEvidence:{path:string;sha256:string}|null=null,effectiveSettings:ReVoiceResult["requestSettings"]|null=null;
    if(binding.castPath)try{
      const sidecar=asset(dataDir,`${binding.castPath}.json`);
      const saved=JSON.parse(readFileSync(resolve(dataDir,"assets",sidecar.path),"utf8")) as {voiceId?:string;requestSettings?:ReVoiceResult["requestSettings"]};
      if(saved.voiceId===binding.voiceId && saved.requestSettings?.model_id===VOICE_CHANGER_DEFAULTS.model_id &&
          saved.requestSettings.remove_background_noise===VOICE_CHANGER_DEFAULTS.remove_background_noise && saved.requestSettings.output_format===VOICE_CHANGER_DEFAULTS.output_format){
        voiceEvidence=sidecar;effectiveSettings=saved.requestSettings;
      }
    }catch{/* held below */}
    if(!voiceEvidence||!effectiveSettings){holds.push(`Historical voice request/settings for character ${binding.characterId} cannot be proven from its retained cast master.`);continue;}
    const rows = db.prepare("SELECT id,path,content_hash FROM character_assets WHERE character_version_id=? AND asset_role='scene_reference' ORDER BY id").all(binding.versionId) as Array<{id:string;path:string;content_hash:string|null}>;
    const visualAssets: Voice["visualAssets"] = [];
    for (const row of rows) {
      try {
        const file = asset(dataDir,row.path);
        if (row.content_hash && row.content_hash !== file.sha256) holds.push(`Approved visual asset changed for character ${binding.characterId}.`);
        visualAssets.push({id:row.id,...file});
      } catch { holds.push(`Approved visual asset is unavailable for character ${binding.characterId}.`); }
    }
    if (!visualAssets.length) holds.push(`No retained scene reference exists for character ${binding.characterId}.`);
    const prior=voices.find(voice=>voice.characterId===binding.characterId);
    if(prior){if(prior.versionId!==binding.versionId || prior.voiceId!==binding.voiceId || canonical(prior.effectiveSettings)!==canonical(effectiveSettings))holds.push(`Donor character ${binding.characterId} has inconsistent historical voice identities or settings.`);continue;}
    voices.push({characterId:binding.characterId,versionId:binding.versionId,voiceId:binding.voiceId,voiceProvider:binding.voiceProvider,
      approvedBy:binding.approvedBy,approvedAt:binding.approvedAt,effectiveSettings,voiceEvidence,visualAssets});
  }
  if (!voices.length) holds.push("The donor has no exact approved speaking-shot voice bindings to pin.");
  const estimate = {newSpeakingPictures: Array.isArray(timeline) ? bindings.length : null,
    reuseCandidates: Array.isArray(timeline) ? Math.max(0,timeline.length-bindings.length) : null,costUsd:null};
  const evidence = {version:1,sourceProjectId:project.id,sourceRevision:project.updated_at,renderId:render.id,
    renderSha256:renderFile?.sha256 ?? null,approvalId:approval?.id ?? null,timelineSha256:render.timeline_json ? sha(render.timeline_json) : null,
    sourceAudioSha256:render.source_audio_json ? sha(render.source_audio_json) : null,
    language,book:project.book,chapter:project.chapter,audio,text,reference,titleBackground,voices,sourceAudioEvidence,pictureEvidence,title:input.title};
  return {status:holds.length?"held":"ready",holds,sourceQuestions,fingerprint:sha(canonical(evidence)),
    donor:{projectId:project.id,renderId:render.id,renderPath:renderFile?.path??null,approvalId:approval?.id??null,renderSha256:renderFile?.sha256 ?? null,
      timelineSha256:evidence.timelineSha256,sourceAudioSha256:evidence.sourceAudioSha256,revision:project.updated_at},
    target:{language,book:project.book,chapter:project.chapter,audio,text,reference,titleBackground,title:input.title},voices,sourceAudioEvidence,pictureEvidence,estimate};
}

export interface EditionCreateRequest extends EditionRequest { requestId: string; checkedFingerprint: string }
type Origin = { version: 1; targetProjectId: string; requestHash: string; preflight: EditionPreflight; createdAt: number };
export function readLanguageEditionOrigin(db: DatabaseSync, projectId: string): Origin | null {
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='edit_commands'").get())return null;
  const rows = db.prepare("SELECT payload,undone FROM edit_commands WHERE project_id=? AND command_type='derive_language_edition' ORDER BY sequence").all(projectId) as Array<{payload:string;undone:number}>;
  if (!rows.length) return null;
  if (rows.length !== 1 || rows[0]!.undone) throw new Error("Language-edition origin is missing or was altered.");
  const origin = JSON.parse(rows[0]!.payload) as Origin;
  if (origin.version !== 1 || origin.targetProjectId !== projectId || !origin.preflight?.target || !origin.preflight?.donor) throw new Error("Language-edition origin is malformed.");
  return origin;
}

/** One atomic workspace identity and non-undoable origin. Stage rows remain empty. */
export function createLanguageEdition(db: DatabaseSync, dataDir: string, sourceProjectId: string, input: EditionCreateRequest): { project: Project; created: boolean; origin: Origin } {
  if (!input || typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
      typeof input.checkedFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(input.checkedFingerprint)) throw new Error("A request ID and checked preflight fingerprint are required.");
  const key = `language-edition:create:${input.requestId}`;
  const requestHash = sha(canonical({sourceProjectId,renderId:input.renderId,targetLanguage:input.targetLanguage.trim().toLowerCase(),title:input.title,checkedFingerprint:input.checkedFingerprint}));
  const prior = db.prepare("SELECT project_id,payload FROM edit_commands WHERE idempotency_key=?").get(key) as {project_id:string;payload:string}|undefined;
  if (prior) {
    const origin = JSON.parse(prior.payload) as Origin;
    if (origin.requestHash !== requestHash) throw new Error("Request ID was already used for a different language-edition request.");
    const project = db.prepare("SELECT id,language,book,chapter,updated_at FROM projects WHERE id=?").get(prior.project_id) as Project;
    if (!project || readLanguageEditionOrigin(db,project.id)?.requestHash !== requestHash) throw new Error("Saved edition origin is inconsistent.");
    return {project,created:false,origin};
  }
  const preflight = preflightLanguageEdition(db,dataDir,sourceProjectId,input);
  if (preflight.fingerprint !== input.checkedFingerprint) throw new Error("Preflight inputs changed; inspect the selected donor and target sources again.");
  if (preflight.status !== "ready") throw new Error(`Language edition is held: ${preflight.holds.join(" ")}`);
  const now = Date.now(), id = randomUUID();
  const origin: Origin = {version:1,targetProjectId:id,requestHash,preflight,createdAt:now};
  db.exec("BEGIN IMMEDIATE");
  try {
    const raced = db.prepare("SELECT project_id,payload FROM edit_commands WHERE idempotency_key=?").get(key) as {project_id:string;payload:string}|undefined;
    if (raced) throw new Error("A concurrent edition request used this request ID; retry to inspect it.");
    const donor = db.prepare("SELECT updated_at FROM projects WHERE id=?").get(sourceProjectId) as {updated_at:number}|undefined;
    if (!donor || donor.updated_at !== preflight.donor.revision) throw new Error("Donor project revision changed after preflight.");
    const occupied = db.prepare("SELECT id FROM projects WHERE language=? AND book=? AND chapter=?").get(preflight.target.language,preflight.target.book,preflight.target.chapter) as {id:string}|undefined;
    if (occupied) throw new Error(`Target chapter already has an unrelated workspace (${occupied.id}).`);
    db.prepare("INSERT INTO projects(id,language,book,chapter,stage,status,created_at,updated_at) VALUES(?,?,?,?,'ingestion','not_started',?,?)")
      .run(id,preflight.target.language,preflight.target.book,preflight.target.chapter,now,now);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES(?,?,1,'derive_language_edition',?,?,?,0)")
      .run(randomUUID(),id,JSON.stringify(origin),key,now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return {project:{id,language:preflight.target.language,book:preflight.target.book,chapter:preflight.target.chapter,updated_at:now},created:true,origin};
}

/** Immutable origin uses only asset-relative references; restore must not rewrite it. */
export function languageEditionTitle(db: DatabaseSync, projectId: string): EditionTitle | null {
  return readLanguageEditionOrigin(db,projectId)?.preflight.target.title ?? null;
}

/** Narrow cross-language Papuan authority; ordinary projects gain nothing. */
export function approvedEditionCanon(db:DatabaseSync,projectId:string): boolean {
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)return false;
  const target=origin.preflight.target,donor=origin.preflight.donor;
  if(target.language!=="meyah" || target.book!=="mark" || origin.preflight.status!=="ready" || !donor.renderSha256 || !origin.preflight.voices.length)return false;
  const project=db.prepare("SELECT language,book,chapter FROM projects WHERE id=?").get(projectId) as {language:string;book:string;chapter:number}|undefined;
  if(!project || project.language!==target.language || project.book!==target.book || project.chapter!==target.chapter)return false;
  return origin.preflight.voices.every(voice=>{
    const row=db.prepare("SELECT cv.voice_provider AS provider,cv.voice_id AS voiceId,cv.status,c.canon_status AS canon,c.region FROM character_versions cv JOIN characters c ON c.id=cv.character_id WHERE cv.id=? AND c.id=?").get(voice.versionId,voice.characterId) as {provider:string;voiceId:string;status:string;canon:string;region:string}|undefined;
    return row?.provider==="elevenlabs" && row.voiceId===voice.voiceId && row.status==="approved" && row.canon==="approved" && row.region==="Papuan";
  });
}

export function assertEditionInputsCurrent(db:DatabaseSync,dataDir:string,projectId:string):void {
  const origin=readLanguageEditionOrigin(db,projectId);
  if(!origin)return;
  if(!approvedEditionCanon(db,projectId))throw new Error("Pinned edition canon or voice identity changed.");
  const target=origin.preflight.target;
  for(const pinned of [target.audio,target.text,target.reference]){
    if(!pinned || asset(dataDir,pinned.path).sha256!==pinned.sha256)throw new Error("Pinned target source file is unavailable or changed.");
  }
  if(!target.titleBackground || asset(dataDir,target.titleBackground.path).sha256!==target.titleBackground.sha256)
    throw new Error("Pinned clean title background changed or is unavailable.");
  for(const voice of origin.preflight.voices)for(const pinned of voice.visualAssets)
    if(asset(dataDir,pinned.path).sha256!==pinned.sha256)throw new Error("Pinned approved character visual changed.");
  for(const voice of origin.preflight.voices)
    if(asset(dataDir,voice.voiceEvidence.path).sha256!==voice.voiceEvidence.sha256)
      throw new Error("Pinned historical ElevenLabs voice/settings evidence changed.");
  for(const pinned of origin.preflight.sourceAudioEvidence)
    if(asset(dataDir,pinned.path).sha256!==pinned.sha256)throw new Error("Pinned donor source-audio evidence changed.");
  for(const pinned of origin.preflight.pictureEvidence){
    const selection=db.prepare(`SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
      JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
      WHERE c.id=? AND ga.id=? AND ga.shot_id=? AND sc.project_id=? AND ga.status='accepted' AND ga.result_asset_path=?`)
      .get(pinned.clipId,pinned.attemptId,pinned.shotId,origin.preflight.donor.projectId,pinned.path);
    if(!selection)throw new Error("Pinned donor picture selection changed.");
    if(asset(dataDir,pinned.path).sha256!==pinned.sha256 || asset(dataDir,pinned.keyframePath).sha256!==pinned.keyframeSha256)
      throw new Error("Pinned donor picture or scene-specific keyframe changed.");
  }
  const donor=origin.preflight.donor;
  const approval=db.prepare("SELECT id FROM edit_commands WHERE id=? AND project_id=? AND undone=0 AND json_valid(payload) AND json_extract(payload,'$.renderId')=? AND json_extract(payload,'$.decision')='approved'")
    .get(donor.approvalId,donor.projectId,donor.renderId);
  if(!approval)throw new Error("Pinned donor render approval was removed or changed.");
  const render=db.prepare("SELECT r.result_asset_path,m.timeline_json,m.source_audio_json FROM chapter_renders r JOIN chapter_render_manifests m ON m.render_id=r.id WHERE r.id=? AND r.project_id=?")
    .get(donor.renderId,donor.projectId) as {result_asset_path:string;timeline_json:string;source_audio_json:string}|undefined;
  if(!render || asset(dataDir,render.result_asset_path).sha256!==donor.renderSha256 || sha(render.timeline_json)!==donor.timelineSha256 || sha(render.source_audio_json)!==donor.sourceAudioSha256)
    throw new Error("Pinned donor render or normalized recipe is unavailable or changed.");
  const plan=readLanguageEditionPlan(db,projectId);
  const cast=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}|undefined;
  if(cast){
    const saved=JSON.parse(cast.payload) as {planHash:string;shots:Array<{donorShotId:string;targetShotId:string}>};
    if(saved.planHash!==plan?.hash || !plan?.revision || saved.shots.length!==plan.revision.correspondence.length)
      throw new Error("Edition shot selection no longer matches its reviewed correspondence.");
    for(let index=0;index<saved.shots.length;index++){
      const selected=saved.shots[index]!,reviewed=plan.revision.correspondence[index]!;
      if(selected.donorShotId!==reviewed.donorShotId)throw new Error("Edition shot order changed after review.");
      if(reviewed.targetSegmentId!==null){
        const segment=db.prepare("SELECT start_ms,end_ms,speaker_character_id,source_path FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'")
          .get(reviewed.targetSegmentId,projectId) as {start_ms:number;end_ms:number;speaker_character_id:string|null;source_path:string}|undefined;
        const donorShot=db.prepare("SELECT needs_lip_sync,dialogue_character_id FROM shots WHERE id=?").get(reviewed.donorShotId) as {needs_lip_sync:number;dialogue_character_id:string|null}|undefined;
        const run=reviewed.targetSpeechRunId?readConfirmedSpeechRuns(db,projectId,dataDir).find(value=>value.id===reviewed.targetSpeechRunId):null;
        if((reviewed.targetSpeechRunId && (!run || !run.members.some(member=>member.id===reviewed.targetSegmentId))) || !segment || !donorShot ||
            (run?.startMs??segment.start_ms)>reviewed.targetStartMs! || (run?.endMs??segment.end_ms)<reviewed.targetEndMs! ||
            segment.source_path!==target.audio?.path || (donorShot.needs_lip_sync===1 && (run?.characterId??segment.speaker_character_id)!==donorShot.dialogue_character_id))
          throw new Error("Target source interval or speaker changed after edition correspondence review.");
      }
    }
    const intro=db.prepare("SELECT plan_json FROM chapter_intro_plans WHERE project_id=?").get(projectId) as {plan_json:string}|undefined;
    const title=intro?JSON.parse(intro.plan_json).titleCard as {title:string;language:string;durationMs:number;profile?:string}:null;
    if(!title || title.title!==target.title.bookChapter || title.language!==target.title.languageName || title.durationMs!==target.title.durationMs || title.profile!==target.title.profile)
      throw new Error("Saved edition opening title differs from the approved target-language title.");
  }
}

export interface EditionShotCorrespondence {
  donorShotId: string;
  targetSegmentId: string | null;
  targetSpeechRunId?: string | null;
  targetStartMs: number | null;
  targetEndMs: number | null;
  treatment: "reuse_picture" | "replace_avatar" | "needs_coverage";
  reason: string;
}
export interface EditionPlanRevision {
  version: 1; targetProjectId: string; parentHash: string; revisionHash: string;
  correspondence: EditionShotCorrespondence[]; reviewer: string; evidence: string; createdAt: number;
}
export function readLanguageEditionPlan(db: DatabaseSync, projectId: string): {hash:string; sequence:number; revision:EditionPlanRevision|null} | null {
  const origin = readLanguageEditionOrigin(db,projectId);
  if (!origin) return null;
  const rows=db.prepare("SELECT sequence,payload,undone FROM edit_commands WHERE project_id=? AND command_type='revise_language_edition' ORDER BY sequence").all(projectId) as Array<{sequence:number;payload:string;undone:number}>;
  let hash=sha(canonical(origin)),sequence=1,revision:EditionPlanRevision|null=null;
  for (const row of rows) {
    if (row.undone) throw new Error("Language-edition plan revision was undone; provenance must remain append-only.");
    const value=JSON.parse(row.payload) as EditionPlanRevision;
    if (value.version!==1 || value.targetProjectId!==projectId || value.parentHash!==hash ||
        value.revisionHash!==sha(canonical({targetProjectId:projectId,parentHash:value.parentHash,correspondence:value.correspondence,reviewer:value.reviewer,evidence:value.evidence})))
      throw new Error("Language-edition revision chain is invalid.");
    hash=value.revisionHash;sequence=row.sequence;revision=value;
  }
  return {hash,sequence,revision};
}

/** Explicit source-clock correspondence, saved before stage 3 uses it. */
export function reviseLanguageEdition(db: DatabaseSync, projectId: string, input: {
  requestId:string; expectedParentHash:string; correspondence:EditionShotCorrespondence[]; reviewer:string; evidence:string;
},dataDir?:string): {revision:EditionPlanRevision;created:boolean} {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId ?? "") || !/^[a-f0-9]{64}$/.test(input.expectedParentHash ?? "") ||
      !input.reviewer?.trim() || !input.evidence?.trim() || !Array.isArray(input.correspondence) || !input.correspondence.length)
    throw new Error("A request ID, parent hash, named reviewer, evidence and shot correspondence are required.");
  const origin=readLanguageEditionOrigin(db,projectId);
  if (!origin) throw new Error("Only a created language edition can receive a correspondence revision.");
  const donorProjectId=origin.preflight.donor.projectId;
  const seen=new Set<string>();
  for (const item of input.correspondence) {
    if (!item || !["reuse_picture","replace_avatar","needs_coverage"].includes(item.treatment) || !item.reason?.trim()) throw new Error("Every mapped shot needs a disposition and reviewable reason.");
    const shot=db.prepare(`SELECT sh.needs_lip_sync AS speaking,sh.dialogue_character_id AS speaker FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?`).get(item.donorShotId,donorProjectId) as {speaking:number;speaker:string|null}|undefined;
    if (!shot) throw new Error("Correspondence references a foreign or missing donor shot.");
    if (shot.speaking && item.treatment==="reuse_picture") throw new Error("A visibly speaking donor shot cannot reuse its old mouth performance.");
    if (item.treatment==="replace_avatar" && !shot.speaking) throw new Error("Avatar replacement needs a visibly speaking donor shot.");
    const key=canonical(item);if(seen.has(key))throw new Error("Duplicate shot correspondence is not allowed.");seen.add(key);
    if (item.targetSegmentId === null) {
      if (shot.speaking || item.targetSpeechRunId || item.targetStartMs !== null || item.targetEndMs !== null) throw new Error("Speaking shots require an exact target source window.");
      continue;
    }
    const segment=db.prepare("SELECT start_ms AS startMs,end_ms AS endMs,speaker_character_id AS speaker FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(item.targetSegmentId,projectId) as {startMs:number;endMs:number;speaker:string|null}|undefined;
    const run=item.targetSpeechRunId ? (dataDir ? readConfirmedSpeechRuns(db,projectId,dataDir).find(value=>value.id===item.targetSpeechRunId):null):null;
    if(item.targetSpeechRunId && (!run || !run.members.some(member=>member.id===item.targetSegmentId)))
      throw new Error("The target speech run is unavailable or does not contain the anchor segment.");
    const start=run?.startMs??segment?.startMs,end=run?.endMs??segment?.endMs;
    if (!segment || !Number.isInteger(item.targetStartMs) || !Number.isInteger(item.targetEndMs) ||
        item.targetStartMs! < start! || item.targetEndMs! > end! || item.targetStartMs! >= item.targetEndMs!)
      throw new Error("Correspondence requires an exact target original-reading interval within its reviewed segment or speech run.");
    if (shot.speaking && (run?.characterId??segment.speaker)!==shot.speaker) throw new Error("Target speaker does not match the approved donor character identity.");
  }
  const key=`language-edition:${projectId}:revision:${input.requestId}`;
  const body={targetProjectId:projectId,parentHash:input.expectedParentHash,correspondence:input.correspondence,
    reviewer:input.reviewer.trim(),evidence:input.evidence.trim()};
  const revisionHash=sha(canonical(body));
  const prior=db.prepare("SELECT project_id,payload FROM edit_commands WHERE idempotency_key=?").get(key) as {project_id:string;payload:string}|undefined;
  if (prior) {
    const saved=JSON.parse(prior.payload) as EditionPlanRevision;
    if (prior.project_id!==projectId || saved.revisionHash!==revisionHash) throw new Error("Revision request ID was already used for different evidence.");
    return {revision:saved,created:false};
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const parent=readLanguageEditionPlan(db,projectId);
    if (!parent || parent.hash!==input.expectedParentHash) throw new Error("Edition plan changed; refresh its parent revision before appending.");
    const revision:EditionPlanRevision={version:1,...body,revisionHash,createdAt:Date.now()};
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone)VALUES(?,?,?,'revise_language_edition',?,?,?,0)")
      .run(randomUUID(),projectId,sequence,JSON.stringify(revision),key,revision.createdAt);
    db.exec("COMMIT");return {revision,created:true};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
