import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { productionAssetPath } from "../creative-direction/crew-context.js";
import type { CrewBrief, PicturePlacement } from "../creative-direction/crew-types.js";
import { sourceTurnBoundaries } from "../assembly/continuous-audio.js";

/** Evidence on existing review_notes, not a parallel approval database. */
export interface AcceptanceTarget {
  key: string; path: string; contextHash: string; durationMs: number;
  sourceContextHash?: string; sourceMediaHashes?: string[];
  requirements: Array<{ id: string; text: string; atMs?:number }>;
  range?: { startFrame: number; endFrameExclusive: number; crop?: {x:number;y:number;width:number;height:number} };
}
export interface AcceptanceReview {
  kind: "media_acceptance_v1"; key: string; contextHash: string; mediaSha256: string;
  reviewer: string;
  input: { width: number; height: number; fps: number; audioIncluded: boolean };
  sourceEvidenceNoteIds?: string[];
  speech?: {
    measurementHash: string;
    reviewedFrames: Array<{startFrame:number;endFrameExclusive:number}>;
    observations: Array<{startMs:number;endMs:number;audio:"quiet"|"signal_present"|"ended"|"unverified";
      mouth:"articulating"|"closed"|"not_visible"|"unverified";evidence:string}>;
  };
  checks: Array<{ id: string; requirementHash: string; status: "clear" | "hold" | "unverified";
    evidence: string; ranges: Array<{ startMs: number; endMs: number }> }>;
}
export const evidenceHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const mediaHash = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Signal measurements are contradiction evidence, never a voicing/phoneme detector.
 * -30dBFS is the existing ingestion quiet-analysis reference, not a mix target. */
export interface SpeechMeasurements {
  mediaSha256:string;pcmSha256:string;sampleRate:number;fps:number;frames:number;
  durationMs:number;audioEndMs:number;quietReferenceDb:number;
  windows:Array<{startMs:number;endMs:number;rmsDbFS:number}>;
}
const measuredPcm=new WeakMap<SpeechMeasurements,Buffer>();
const measurementCache=new Map<string,SpeechMeasurements>();
function pcmLevel(pcm:Buffer,startMs:number,endMs:number):number|undefined {
  const first=Math.round(startMs*8),last=Math.round(endMs*8);
  if(first<0||last<=first||last*4>pcm.length)return undefined;
  let sum=0;for(let i=first;i<last;i++){const v=pcm.readFloatLE(i*4);sum+=v*v;}
  return 20*Math.log10(Math.max(1e-12,Math.sqrt(sum/(last-first))));
}
export function measureSpeechEvidence(path:string,fps:number,frames:number):SpeechMeasurements {
  if(!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(frames)||frames<1)throw Error("QC hold: invalid measured frame clock.");
  const sha256=mediaHash(path),key=`${sha256}:${fps}:${frames}`,cached=measurementCache.get(key);if(cached)return cached;
  const pcm=execFileSync("ffmpeg",["-v","error","-i",path,"-map","0:a:0","-f","f32le","-ac","1","-ar","8000","pipe:1"],{windowsHide:true,maxBuffer:128*1024*1024});
  const audioDuration=Number(execFileSync("ffprobe",["-v","error","-select_streams","a:0","-show_entries","stream=duration","-of","csv=p=0",path],{encoding:"utf8",windowsHide:true}).trim())*1000;
  const audioEndMs=Math.min(pcm.length/32,Number.isFinite(audioDuration)&&audioDuration>0?audioDuration:pcm.length/32);
  const durationMs=frames*1000/fps,windows:SpeechMeasurements["windows"]=[];
  for(let startMs=0;startMs<Math.min(durationMs,audioEndMs);startMs+=100){const endMs=Math.min(durationMs,audioEndMs,startMs+100),db=pcmLevel(pcm,startMs,endMs);if(db!==undefined)windows.push({startMs,endMs,rmsDbFS:db});}
  const result:SpeechMeasurements={mediaSha256:sha256,pcmSha256:createHash("sha256").update(pcm).digest("hex"),sampleRate:8000,fps,frames,durationMs,audioEndMs,quietReferenceDb:-30,windows};
  for(const window of result.windows)Object.freeze(window);Object.freeze(result.windows);Object.freeze(result);
  measuredPcm.set(result,pcm);measurementCache.set(key,result);if(measurementCache.size>4)measurementCache.delete(measurementCache.keys().next().value!);
  return result;
}
// One microsecond handles decimal serialization, never an unreviewed frame.
const TIME_EPSILON_MS=.001;
function covers(ranges:Array<{start:number;end:number}>,endExclusive:number,epsilon=0):boolean {
  let end=0;for(const r of [...ranges].sort((a,b)=>a.start-b.start)){if(r.start>end+epsilon)return false;end=Math.max(end,r.end);}return end>=endExclusive-epsilon;
}
function speechFindings(review:AcceptanceReview,measurements:SpeechMeasurements|undefined):string[] {
  const supplied=review.speech,holds:string[]=[];
  if(!measurements||!supplied||supplied.measurementHash!==evidenceHash(measurements))return ["speech_activity/speech_rest/speech_sync: missing or stale independent signal measurements and observations."];
  const frames=supplied.reviewedFrames;
  if(!Array.isArray(frames)||!frames.length||frames.some(r=>!r||!Number.isSafeInteger(r.startFrame)||!Number.isSafeInteger(r.endFrameExclusive)||r.startFrame<0||r.endFrameExclusive<=r.startFrame||r.endFrameExclusive>measurements.frames)||
    !covers(frames.map(r=>({start:r.startFrame,end:r.endFrameExclusive})),measurements.frames))holds.push("speech: incomplete end-exclusive whole-performance frame review.");
  const observations=supplied.observations;
  if(!Array.isArray(observations)||!observations.length)return [...holds,"speech: missing time-indexed audio and visible-mouth observations."];
  const pcm=measuredPcm.get(measurements);
  if(!pcm)return [...holds,"speech: signal facts were not independently decoded."];
  for(const o of observations){
    if(!o||!Number.isFinite(o.startMs)||!Number.isFinite(o.endMs)||o.startMs<0||o.endMs<=o.startMs||o.endMs>measurements.durationMs+TIME_EPSILON_MS||typeof o.evidence!=="string"||!o.evidence.trim()) {holds.push("speech: invalid observed interval.");continue;}
    if(!["quiet","signal_present","ended"].includes(o.audio)||!["articulating","closed","not_visible"].includes(o.mouth))holds.push("speech: audio or mouth state remains unverified.");
    if(o.audio==="ended"){
      if(o.startMs<measurements.audioEndMs-TIME_EPSILON_MS||measurements.durationMs-measurements.audioEndMs>1000/measurements.fps+TIME_EPSILON_MS)
        holds.push("speech: audio-ended claim precedes the measured stream endpoint or exceeds one retained frame.");
      continue; // Explicit absent track tail; never manufacture silence or infer completed words.
    }
    if(o.endMs>measurements.audioEndMs+TIME_EPSILON_MS){holds.push("speech: observation spans beyond the measured audio endpoint; split the absent track tail explicitly.");continue;}
    const db=pcmLevel(pcm,o.startMs,o.endMs);
    if(db===undefined)holds.push("speech: observed interval exceeds independently decoded audio.");
    else {
      const signal=db>=measurements.quietReferenceDb||measurements.windows.some(w=>w.startMs>=o.startMs&&w.endMs<=o.endMs&&w.rmsDbFS>=measurements.quietReferenceDb);
      if(o.audio==="quiet"&&signal)holds.push(`speech_rest/speech_activity: claimed quiet ${o.startMs}-${o.endMs}ms contradicts measured signal (${db.toFixed(2)}dBFS); voicing remains a separate judgment.`);
      if(o.audio==="signal_present"&&!signal)holds.push(`speech_activity: claimed signal ${o.startMs}-${o.endMs}ms is below the measured reference; this is not phoneme adjudication.`);
    }
    // Closed-mouth consonants, breaths and intentional listener cutaways are not automatic failures.
  }
  const valid=observations.filter(o=>o&&Number.isFinite(o.startMs)&&Number.isFinite(o.endMs)&&o.startMs>=0&&o.endMs>o.startMs&&o.endMs<=measurements.durationMs+TIME_EPSILON_MS);
  if(!covers(valid.map(o=>({start:o.startMs,end:o.endMs})),measurements.durationMs,TIME_EPSILON_MS))holds.push("speech: observations do not cover the complete performance.");
  return holds;
}
function sourceAspect(id:string):"linguistic_ownership"|"speaker_attribution"|"sample_transport"|undefined {
  if(id==="source_boundaries"||id.startsWith("boundary:"))return "linguistic_ownership";
  if(id==="audio:voice_ownership")return "speaker_attribution";
  if(id==="source_transport"||id==="audio:source_integrity")return "sample_transport";
  return undefined;
}
/** Separately recorded, scoped observations on existing notes. The model response
 * cannot issue these records or upgrade its own authority through a label. */
export interface SourceEvidence {
  kind:"source_evidence_v1";sourceContextHash:string;aspect:"linguistic_ownership"|"speaker_attribution"|"sample_transport";
  reviewer:string;status:"clear"|"hold"|"unverified";checkIds:string[];evidence:string;
  provenance:{kind:"competent_language_review";language:string;competenceAttestation:string}|
    {kind:"speaker_review";basis:string}|
    {kind:"measured_transport";method:string;inputHashes:string[];resultHash:string};
  mediaSha256?:string;
}
function validatedSourceChecks(db:DatabaseSync,projectId:string,target:AcceptanceTarget,review:AcceptanceReview,sha256:string):Set<string> {
  const valid=new Set<string>(),seen=new Set<string>(),linked=new Set(review.sourceEvidenceNoteIds??[]);
  const language=String(db.prepare("SELECT language FROM projects WHERE id=?").get(projectId)?.language??"").toLowerCase();
  for(const row of db.prepare("SELECT id,source,note FROM review_notes WHERE project_id=? ORDER BY created_at DESC,rowid DESC").all(projectId)){
    let n:SourceEvidence;try{n=JSON.parse(String(row.note));}catch{continue;}
    if(n?.kind!=="source_evidence_v1"||!target.sourceContextHash||n.sourceContextHash!==target.sourceContextHash||!Array.isArray(n.checkIds)||(n.aspect==="sample_transport"&&n.mediaSha256!==sha256))continue;
    for(const id of n.checkIds){
      if(typeof id!=="string"||sourceAspect(id)!==n.aspect||seen.has(id))continue;seen.add(id);
      if(!linked.has(String(row.id))||n.status!=="clear"||!n.reviewer?.trim()||!n.evidence?.trim())continue;
      const p=n.provenance;
      if(n.aspect==="sample_transport"){
        if(row.source!=="qc"||p?.kind!=="measured_transport"||!p.method?.trim()||!Array.isArray(p.inputHashes)||!p.inputHashes.length||!target.sourceMediaHashes?.length||
          !target.sourceMediaHashes.every(h=>p.inputHashes.includes(h))||!/^([a-f0-9]{64})$/.test(p.resultHash)||n.mediaSha256!==sha256)continue;
      }else if(n.aspect==="speaker_attribution"&&p?.kind==="speaker_review"){
        if(row.source!=="human"||!p.basis?.trim())continue;
      }else if(row.source!=="human"||p?.kind!=="competent_language_review"||p.language?.toLowerCase()!==language||!p.competenceAttestation?.trim())continue;
      valid.add(id);
    }
  }
  return valid;
}

/** The adapter binds measured inputs; model-supplied authority labels/IDs are
 * deliberately not copied. Raw review outputs are retained by the caller. */
export function reviewWithSpeechEvidence(target:AcceptanceTarget,result:{checks:AcceptanceReview["checks"];speech?:AcceptanceReview["speech"]},
  native:AcceptanceReview["input"],measurements:SpeechMeasurements,reviewer:string):AcceptanceReview {
  return {kind:"media_acceptance_v1",key:target.key,contextHash:target.contextHash,mediaSha256:measurements.mediaSha256,reviewer,input:native,
    checks:result.checks.map(c=>({...c,requirementHash:evidenceHash(target.requirements.find(r=>r.id===c.id)?.text??"UNKNOWN REQUIREMENT")})),
    ...(result.speech?{speech:{measurementHash:evidenceHash(measurements),reviewedFrames:result.speech.reviewedFrames,observations:result.speech.observations}}:{})};
}

function canonInputs(db: DatabaseSync, dataDir: string, ids: string[]) {
  return [...new Set(ids)].sort().map(id => {
    const refs = db.prepare(`SELECT v.id versionId,a.path,a.content_hash FROM character_versions v
      JOIN character_assets a ON a.character_version_id=v.id WHERE v.character_id=? AND v.status='approved' ORDER BY a.id`).all(id);
    if (!refs.length) throw Error(`QC hold: missing approved canonical references for ${id}.`);
    return { id, refs: refs.map(r => {
      const sha256=mediaHash(productionAssetPath(dataDir,String(r.path)));
      if(r.content_hash && String(r.content_hash).toLowerCase()!==sha256)throw Error(`QC hold: canonical reference changed for ${id}.`);
      return {versionId:r.versionId,path:r.path,sha256};
    }) };
  });
}

/** Bind the existing LTX receipt as evidence, without invoking the generator.
 * Valid transport is necessary, but never certifies visible articulation. */
export function retainedSpeakingInputs(dataDir:string,candidatePath:string):unknown {
  const root=dirname(productionAssetPath(dataDir,candidatePath)),manifestPath=join(root,"line.json");
  if(!existsSync(manifestPath))return null; // Other backends have no LTX receipt.
  const line=JSON.parse(readFileSync(manifestPath,"utf8")),plan=line.plan;
  const check=(path:string,expected:string)=>{
    if(typeof path!=="string"||!path)throw Error("QC hold: missing retained native/source/carry path.");
    const actual=mediaHash(productionAssetPath(dataDir,path));
    if(!expected||actual!==expected)throw Error("QC hold: retained native/source/carry evidence changed.");
    return {path,sha256:actual};
  };
  const inputs=[check(candidatePath,line.outputSha256),check(line.source.path,line.source.sourceSha256),
    check(join(root,"full-line.wav"),line.fullLineAudioSha256)];
  if(!plan||!Array.isArray(plan.sections)||!plan.sections.length||!Array.isArray(line.sections)||line.sections.length!==plan.sections.length)
    throw Error("QC hold: incomplete retained speaking evidence.");
  let sample=0,frame=0;
  for(const [i,section] of line.sections.entries()){
    const expected=plan.sections[i],length=section.sourceEndSample-section.sourceStartSample;
    if(Object.entries(expected).some(([key,value])=>JSON.stringify(section[key])!==JSON.stringify(value))||section.index!==i||section.sourceStartSample!==sample||length<=0||
      section.pictureStartFrame!==frame||section.lastRetainedFrameIndex!==section.retainedFrames-1||section.tailPaddingSamples+length!==section.generationContainerSeconds*plan.sampleRate)
      throw Error("QC hold: speaking partition repeats/loses samples, changes retained carry or substitutes padded tail.");
    inputs.push(check(section.rawPath,section.rawSha256),check(join(root,`section-${i}.wav`),section.submittedAudioSha256));
    // Only an outgoing section needs a carry; the last section has no successor.
    if(i<line.sections.length-1||section.carryImagePath)inputs.push(check(section.carryImagePath,section.carryImageSha256));
    if(section.nativeInput)inputs.push(check(section.nativeInput.path,section.nativeInput.sha256));
    sample=section.sourceEndSample;frame+=section.retainedFrames;
  }
  if(sample!==plan.sampleCount||frame!==plan.totalFrames||line.source.sourceEndSample-line.source.sourceStartSample!==sample)
    throw Error("QC hold: incomplete source samples or retained frames.");
  return {manifestSha256:mediaHash(manifestPath),inputs};
}

export function attemptAcceptanceTarget(db: DatabaseSync, dataDir: string, projectId: string, attemptId: string,
  durationMs: number, range?: AcceptanceTarget["range"]): AcceptanceTarget {
  const row=db.prepare(`SELECT g.result_asset_path,g.prompt,g.provider,g.model,g.operation,s.id shotId,s.action,s.needs_lip_sync,s.dialogue_character_id,s.continuity_notes
    FROM generation_attempts g JOIN shots s ON s.id=g.shot_id JOIN scenes sc ON sc.id=s.scene_id
    WHERE g.id=? AND sc.project_id=?`).get(attemptId,projectId);
  if(!row?.result_asset_path)throw Error("QC hold: missing project candidate.");
  const ids=db.prepare("SELECT character_id FROM shot_characters WHERE shot_id=? ORDER BY character_id").all(String(row.shotId)).map(r=>String(r.character_id));
  if(row.needs_lip_sync&&row.dialogue_character_id)ids.push(String(row.dialogue_character_id));
  const canon=canonInputs(db,dataDir,ids);
  const speakingInputs=row.needs_lip_sync?retainedSpeakingInputs(dataDir,String(row.result_asset_path)):null;
  const binding=db.prepare("SELECT b.*,a.source_path FROM shot_utterance_bindings b JOIN audio_segments a ON a.id=b.source_audio_segment_id WHERE b.shot_id=?").get(String(row.shotId))??null;
  if(binding && mediaHash(productionAssetPath(dataDir,String(binding.source_path)))!==binding.source_hash)
    throw Error("QC hold: bound source audio changed.");
  const plan=db.prepare("SELECT id,brief_hash FROM production_runs WHERE project_id=? AND phase='planning' AND status='approved' ORDER BY created_at DESC,id DESC LIMIT 1").get(projectId)??null;
  const requirements=[{id:`action:${row.shotId}`,text:String(row.action)},{id:"geometry",text:"Intelligible physical action, support, anatomy and continuity; no pop-in or deformed objects."},
    {id:"captions",text:"No unintended text or graphic artifacts in the selected picture."}];
  for(const c of canon) {
    requirements.push({id:`identity:${c.id}`,text:`Recognizable face, hair, age and build against exact current references: ${JSON.stringify(c)}`});
    requirements.push({id:`wardrobe:${c.id}`,text:`Visible current approved body/wardrobe and story state: ${JSON.stringify(c)}`});
  }
  if(row.needs_lip_sync)for(const id of ["speech_activity","speech_sync","speech_rest","joins","coverage","source_boundaries","source_transport"])
    requirements.push({id,text:`Whole selected performance ${id}: actual source-bound speech, pauses, visible-speaker/listener intervals and all joins; no claim from valid partitioning or files alone.`});
  const sourceMediaHashes=binding?[String(binding.source_hash)]:[];
  return {sourceContextHash:evidenceHash({projectId,binding}),sourceMediaHashes,key:`attempt:${attemptId}${range?`:range:${evidenceHash(range)}`:""}`,path:String(row.result_asset_path),durationMs,range,requirements,
    contextHash:evidenceHash({projectId,row,binding,canon,speakingInputs,plan,durationMs,range:range??null,requirements})};
}

export function cutAcceptanceTarget(db: DatabaseSync,dataDir:string,projectId:string,key:string,path:string,
  brief:CrewBrief,timeline:PicturePlacement[],durationMs:number,audioMap=brief.render?.audioMap):AcceptanceTarget {
  const selected=[...new Set(timeline.flatMap(p=>p.shotId?[p.shotId]:[]))].map(id=>{
    const shot=brief.shots.find(s=>s.id===id);if(!shot)throw Error("QC hold: unknown selected shot.");return shot;
  });
  const canon=canonInputs(db,dataDir,selected.flatMap(s=>s.characterIds));
  // A replacement or omitted shot must not erase its planned story obligation.
  // Review records where each obligation survives in this actual cut, or holds it.
  const requirements:AcceptanceTarget["requirements"]=brief.shots.map(s=>({id:`action:${s.id}`,text:s.action}));
  for(const c of canon)for(const aspect of ["identity","wardrobe"])requirements.push({id:`${aspect}:${c.id}`,text:`Actual selected cut ${aspect}: ${JSON.stringify(c)}`});
  for(const boundary of sourceTurnBoundaries(brief.audio)){
    const map=audioMap?.find(p=>p.segmentId===boundary.beforeSegmentId);
    if(!map)throw Error(`QC hold: source boundary ${boundary.id} has no selected audio mapping.`);
    requirements.push({id:boundary.id,text:JSON.stringify(boundary),...(map?{atMs:map.endMs}:{})});
  }
  for(const beat of brief.acceptedEmotionalTreatment?.treatment.beats??[])requirements.push({id:`treatment:${beat.id}`,text:`Observe and record the actual cut effect against this beat. Weak subjective impact remains a craft finding, separate from missing required action/source/canon: ${JSON.stringify(beat)}`});
  for(const s of selected.filter(s=>s.needsLipSync))requirements.push({id:`speech:${s.id}`,text:`Actual complete visible speech/rest/joins and coverage for ${s.id}; listener cutaways are not speaking mouths.`});
  requirements.push({id:"geometry",text:"Actual encoded picture retains intelligible physical support, anatomy, action and continuity."});
  requirements.push({id:"captions",text:"Actual encoded picture has no unintended text or graphic artifacts."});
  requirements.push({id:"audio:source_integrity",text:"Observed complete authorized source/performance, sample order, duration and retained mix; no dropped/repeated speech or changed source-clock mapping."});
  requirements.push({id:"audio:voice_ownership",text:"Observed source-speaker/voice ownership independent of transport coverage and visible listener cutaways."});
  requirements.push({id:"opening_ending",text:"Observed title/source offset and intentional narrative ending, separate from credits."});
  for(const id of ["static","duplicates","short_inserts","colour","regressions"])requirements.push({id:`render:${id}`,text:`Actual encoded-cut ${id} assessment with intentional editorial context; unknown is held.`});
  const plan=db.prepare("SELECT id,brief_hash,result_json FROM production_runs WHERE project_id=? AND phase='planning' AND status='approved' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId)??null;
  const inputs=timeline.map(p=>({ ...p,sha256:p.path?mediaHash(productionAssetPath(dataDir,p.path)):null }));
  const sourceFiles=[...new Set(brief.audio.flatMap(a=>a.path?[a.path]:[]))].sort().map(path=>({path,sha256:mediaHash(productionAssetPath(dataDir,path))}));
  return {sourceContextHash:evidenceHash({projectId,audio:brief.audio,sourceFiles}),sourceMediaHashes:sourceFiles.map(f=>f.sha256),key,path,durationMs,requirements,contextHash:evidenceHash({projectId,inputs,source:brief.source.hashes,audio:brief.audio,
    master:brief.retainedPerformanceMaster,plan,durationMs,audioMap,canon,treatment:brief.acceptedEmotionalTreatment,requirements})};
}

export function acceptanceFindings(target:AcceptanceTarget,review:AcceptanceReview|undefined,actualSha256:string,
  native:{width:number;height:number;fps:number},facts?:{speech?:SpeechMeasurements;sourceChecks?:Set<string>}):string[] {
  const holds:string[]=[];
  if(!review || review.kind!=="media_acceptance_v1")return ["Missing structured actual-media acceptance evidence; a bare clear verdict is insufficient."];
  if(review.key!==target.key||review.contextHash!==target.contextHash||review.mediaSha256!==actualSha256)holds.push("Stale media, selection, source, canon or planned obligations.");
  if(typeof review.reviewer!=="string"||!review.reviewer.trim())holds.push("Missing named actual reviewer.");
  const input=review.input;
  if(!input||input.width!==native.width||input.height!==native.height||!Number.isFinite(input.fps)||input.fps<=0||input.fps>native.fps)holds.push("Missing or altered native review geometry/rate.");
  const speech=target.requirements.some(r=>r.id.startsWith("speech")||r.id.startsWith("boundary:"));
  if((speech||target.requirements.some(r=>r.id.startsWith("audio:")))&&(!input||input.fps!==native.fps||input.audioIncluded!==true))holds.push("Speech needs actual native-rate audiovisual evidence, not a still or sampled silent overview.");
  if(!Array.isArray(review.checks))return [...holds,"Missing obligation assessments."];
  if(new Set(review.checks.map(c=>c.id)).size!==review.checks.length)holds.push("Duplicate obligation assessments.");
  for(const required of target.requirements){
    const check=review.checks.find(c=>c.id===required.id);
    if(!check||check.requirementHash!==evidenceHash(required.text)||check.status!=="clear"||typeof check.evidence!=="string"||!check.evidence.trim()) {
      holds.push(`${required.id}: missing, changed, failed or unverified obligation.`);continue;
    }
    if(!Array.isArray(check.ranges)||!check.ranges.length||check.ranges.some(r=>!r||!Number.isFinite(r.startMs)||!Number.isFinite(r.endMs)||r.startMs<0||r.endMs<=r.startMs||r.endMs>Math.max(target.durationMs,facts?.speech?.durationMs??target.durationMs)+1)){holds.push(`${required.id}: missing or invalid observed media intervals.`);continue;}
    if(required.atMs!==undefined&&!check.ranges?.some(r=>r.startMs<=required.atMs!&&r.endMs>=required.atMs!))holds.push(`${required.id}: boundary itself was not inspected.`);
    if(sourceAspect(required.id)&&!facts?.sourceChecks?.has(required.id))holds.push(`${required.id}: missing current scoped ${sourceAspect(required.id)} evidence; model/file-endpoint claims are insufficient.`);
  }
  if(target.requirements.some(r=>r.id.startsWith("speech")))holds.push(...speechFindings(review,facts?.speech));
  return holds;
}

export function recordAcceptanceReview(db:DatabaseSync,projectId:string,review:AcceptanceReview):string {
  if(review.kind!=="media_acceptance_v1"||!review.key||!review.reviewer?.trim())throw Error("QC review needs a target and named reviewer.");
  const id=randomUUID();db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'project',?,'qc',?,0,?)")
    .run(id,projectId,projectId,JSON.stringify(review),Date.now());return id;
}
export function assertAcceptanceEvidence(db:DatabaseSync,dataDir:string,projectId:string,target:AcceptanceTarget):AcceptanceReview {
  const notes=db.prepare("SELECT note FROM review_notes WHERE project_id=? AND source='qc' ORDER BY created_at DESC,rowid DESC").all(projectId);
  let review:AcceptanceReview|undefined;
  for(const n of notes){try{const r=JSON.parse(String(n.note));if(r.kind==="media_acceptance_v1"&&r.key===target.key){review=r;break;}}catch{/* Historical free-text notes remain history. */}}
  if(!review)throw Error(`QC hold ${target.key}: missing structured actual-media acceptance evidence.`);
  const path=productionAssetPath(dataDir,target.path),sha256=mediaHash(path);
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-count_frames","-show_streams","-of","json",path],{encoding:"utf8",windowsHide:true}));
  const video=probe.streams.find((s:any)=>s.codec_type==="video"),parts=String(video?.r_frame_rate).split("/").map(Number);
  if(!video||!parts[1])throw Error("QC hold: missing native video facts.");
  const fps=parts[0]!/parts[1]!,frames=Number(video.nb_read_frames);
  if(!Number.isSafeInteger(frames)||frames<1||!Number.isFinite(target.durationMs)||target.durationMs<=0||(!target.range&&frames*1000/fps+50<target.durationMs)||target.range&&target.range.endFrameExclusive>frames)throw Error("QC hold: selected video is shorter than the reviewed source interval.");
  const facts={sourceChecks:validatedSourceChecks(db,projectId,target,review,sha256),
    ...(target.requirements.some(r=>r.id.startsWith("speech"))?{speech:measureSpeechEvidence(path,fps,frames)}:{})};
  const holds=acceptanceFindings(target,review,sha256,{width:video.width,height:video.height,fps},facts);
  if(holds.length)throw Error(`QC hold ${target.key}: ${holds.join(" ")}`);
  return review;
}
