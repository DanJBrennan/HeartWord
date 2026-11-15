import { createRequire } from "node:module";
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach,expect,it,vi } from "vitest";
import { acceptanceFindings,assertAcceptanceEvidence,attemptAcceptanceTarget,cutAcceptanceTarget,evidenceHash,mediaHash,recordAcceptanceReview,retainedSpeakingInputs } from "../../src/pipeline/qc/acceptance-evidence.js";
import { acceptLipSyncCandidate,acceptCoveredLipSyncCandidate } from "../../src/pipeline/voice-lipsync/candidate-selection.js";
import { acceptFinalVideoCandidate,selectFinalVideoRange } from "../../src/pipeline/media-generation/final-video.js";
import { assertEncodedAcceptance,retainEncodedCandidate } from "../../src/pipeline/qc/encoded-acceptance.js";
import { sourceTurnBoundaries,continuousAudioGroups } from "../../src/pipeline/assembly/continuous-audio.js";
import { syntheticReview } from "../helpers/acceptance-evidence.js";
import type { CrewBrief } from "../../src/pipeline/creative-direction/crew-types.js";
// Revision authorization is orthogonal. These tests run actual media QC unmocked.
vi.mock("../../src/pipeline/creative-direction/crew-store.js",async original=>({...await original<object>(),
  ...(await import("../helpers/reviewed-plan-gate.js")).reviewedPlanGateFixture,validateAttemptRevision:vi.fn()}));
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(kind:"lip"|"covered"|"final"|"range"="lip",audioRate=48000) {
  const root=mkdtempSync(join(tmpdir(),"hw-qc-regression-"));roots.push(root);mkdirSync(join(root,"assets"));vi.stubEnv("HEARTWORD_DATA_DIR",root);
  const file=join(root,"assets/candidate.mp4");
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","testsrc2=size=128x72:rate=24","-f","lavfi","-i",`sine=frequency=330:sample_rate=${audioRate}`,"-t","1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",file],{windowsHide:true});
  copyFileSync(file,join(root,"assets/source.wav"));writeFileSync(join(root,"assets/ref.png"),"Synthetic canonical reference bytes");
  const db=new DatabaseSync(":memory:");db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',6,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at)VALUES('scene','p',1,'Mark 6:4','Mark 6:4',1);
    INSERT INTO characters(id,name,scope_kind,canon_status,region,created_at,updated_at)VALUES('c','Speaker','global','approved','Papuan',1,1);
    INSERT INTO character_versions(id,character_id,version_label,status,created_at)VALUES('v','c','v1','approved',1);
    INSERT INTO character_assets(id,character_version_id,category,path,created_at)VALUES('ref','v','body_pose','ref.png',1);
    INSERT INTO shots(id,scene_id,sequence,action,needs_lip_sync,dialogue_character_id,created_at)VALUES('shot','scene',1,'Complete the platter handoff',${kind==='lip'||kind==='covered'?1:0},'c',1);
    INSERT INTO shot_characters VALUES('shot','c');
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at)VALUES('audio','p','original_reading','source.wav',0,1000,'c',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES('take','shot','test','test','${kind==='lip'||kind==='covered'?'lip_sync':'generate_final_video'}','saved request','hold_for_review','candidate.mp4',0,1);`);
  db.prepare("INSERT INTO shot_utterance_bindings(id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by)VALUES('binding','shot','audio',0,1000,'v',?,1,'Fixture')").run(mediaHash(join(root,'assets/source.wav')));
  if(kind==='covered')db.exec("INSERT INTO coverage_beats(id,shot_id,sequence,beat_type,audio_start_ms,audio_end_ms,needs_lip_sync,status,created_at)VALUES('beat','shot',1,'lip_sync_insert',0,1000,1,'accepted',1)");
  const target=()=>{const t=attemptAcceptanceTarget(db,root,'p','take',1000,kind==='range'?{startFrame:0,endFrameExclusive:24}:undefined);if(kind==='covered'){t.key+=':beat:beat';t.contextHash+=':beat:0:1000';}return t;};
  const accept=()=>kind==='lip'?acceptLipSyncCandidate(db,'p','take',{reviewer:'Delegated reviewer',evidence:'continue-best-acceptable'}):kind==='covered'?acceptCoveredLipSyncCandidate(db,'p','take','beat'):kind==='final'?acceptFinalVideoCandidate(db,'p','take',1000):selectFinalVideoRange(db,'p','take',{startFrame:0,endFrameExclusive:24},{reviewer:'Producer',evidence:'Approved summary'},root);
  return {root,file,db,target,accept};
}
it.each(['lip','covered','final','range'] as const)('holds %s before mutation on absent, stale, failed or unknown evidence, then admits a measured synthetic control',kind=>{
 const f=fixture(kind);try{
  const hash=mediaHash(f.file),review=syntheticReview(f.target(),f.root);
  f.db.exec("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES('old','p','shot','shot','qc','AV clear; correct IDs; best acceptable',1,1)");
  expect(f.accept).toThrow(/QC hold/);
  for(const status of ['hold','unverified'] as const){const held=structuredClone(review);held.checks[0]!.status=status;recordAcceptanceReview(f.db,'p',held);expect(f.accept).toThrow(/QC hold/);}
  const stale=structuredClone(review);stale.mediaSha256='parent-only';recordAcceptanceReview(f.db,'p',stale);expect(f.accept).toThrow(/Stale/);
  expect(f.db.prepare('SELECT COUNT(*) n FROM clips').get()!.n).toBe(0);expect(f.db.prepare("SELECT status FROM generation_attempts WHERE id='take'").get()!.status).toBe('hold_for_review');expect(mediaHash(f.file)).toBe(hash);
  recordAcceptanceReview(f.db,'p',review);expect(f.accept()).toMatchObject({reused:false});expect(f.accept()).toMatchObject({reused:true});
 }finally{f.db.close();}
});
it('requires native audiovisual whole-line speech/activity/rest/joins/coverage and linguistic evidence independently',()=>{
 const f=fixture();try{
  const target=f.target(),review=syntheticReview(target,f.root);
  for(const id of ['speech_activity','speech_sync','speech_rest','joins','coverage','source_boundaries']){const held=structuredClone(review);held.checks.find(c=>c.id===id)!.status='unverified';recordAcceptanceReview(f.db,'p',held);expect(f.accept).toThrow(new RegExp(id));}
  const sampled=structuredClone(review);sampled.input.fps=1;sampled.input.audioIncluded=false;expect(acceptanceFindings(target,sampled,review.mediaSha256,{width:128,height:72,fps:24}).join(' ')).toMatch(/native-rate audiovisual/);
  const partial=structuredClone(review);partial.checks.find(c=>c.id==='speech_activity')!.ranges=[{startMs:100,endMs:1000}];recordAcceptanceReview(f.db,'p',partial);expect(f.accept).toThrow(/whole-performance/);
  const malformed=structuredClone(review);(malformed.checks[0] as any).ranges={};expect(()=>acceptanceFindings(target,malformed,review.mediaSha256,{width:128,height:72,fps:24})).not.toThrow();
 }finally{f.db.close();}
});
it('invalidates changed request, action, canon, source, selected interval and media bytes',()=>{
 const f=fixture();try{
  const target=f.target(),review=syntheticReview(target,f.root);recordAcceptanceReview(f.db,'p',review);
  f.db.exec("UPDATE generation_attempts SET prompt='Changed request'");expect(f.accept).toThrow(/Stale/);
  f.db.exec("UPDATE generation_attempts SET prompt='saved request';UPDATE shots SET action='Replacement reactions'");expect(f.accept).toThrow(/Stale/);
  f.db.exec("UPDATE shots SET action='Complete the platter handoff'");writeFileSync(join(f.root,'assets/ref.png'),'changed canon');expect(f.accept).toThrow(/Stale/);
  writeFileSync(join(f.root,'assets/source.wav'),'changed source');expect(f.accept).toThrow(/source audio changed/);
  expect(f.db.prepare('SELECT COUNT(*) n FROM clips').get()!.n).toBe(0);
  expect(acceptanceFindings({...target,contextHash:evidenceHash('different range')},review,review.mediaSha256,{width:128,height:72,fps:24}).join(' ')).toMatch(/Stale/);
  expect(acceptanceFindings(target,review,'changed output',{width:128,height:72,fps:24}).join(' ')).toMatch(/Stale/);
 }finally{f.db.close();}
});
it('cannot replace missing action or unverified face/wardrobe/treatment with valid cast IDs and a clear overview',()=>{
 const f=fixture('final');try{
  const target=f.target();target.requirements.push({id:'treatment:banquet',text:'Observed effect of approved banquet beat'});const review=syntheticReview(target,f.root);
  for(const id of ['action:shot','identity:c','wardrobe:c','treatment:banquet']){const held=structuredClone(review);held.checks.find(c=>c.id===id)!.status='unverified';expect(acceptanceFindings(target,held,review.mediaSha256,{width:128,height:72,fps:24}).join(' ')).toContain(id);}
 }finally{f.db.close();}
});
it('keeps all source ownership obligations after 49 placements merge to one retained transport read',()=>{
 const source=Array.from({length:49},(_,i)=>({id:String(i),startMs:i*1000,endMs:(i+1)*1000,speakerId:i%2?'c':null}));
 const placements=source.map(s=>({segmentId:s.id,path:'continuous.wav',speakerId:s.speakerId,voice:s.speakerId?'cast' as const:'original' as const,sourceStartMs:s.startMs,sourceEndMs:s.endMs,startMs:s.startMs,endMs:s.endMs}));
 expect(continuousAudioGroups(placements,true)).toHaveLength(1);expect(sourceTurnBoundaries(source)).toHaveLength(48);
 const f=fixture('final');try{
  const brief={shots:[{id:'shot',action:'Complete the platter handoff',characterIds:['c'],needsLipSync:false},{id:'omitted',action:'Required source-grounded action replaced by reactions',characterIds:[],needsLipSync:false}],audio:source,source:{hashes:{}},acceptedEmotionalTreatment:{treatment:{beats:[{id:'banquet',effect:'Visible causal handoff'}]}}} as unknown as CrewBrief;
  const target=cutAcceptanceTarget(f.db,f.root,'p','cut','candidate.mp4',brief,[{shotId:'shot',path:'candidate.mp4',startMs:0,endMs:1000} as any],49000,placements);
  expect(target.requirements.some(r=>r.id==='action:omitted')).toBe(true);expect(target.requirements.filter(r=>r.id.startsWith('boundary:'))).toHaveLength(48);expect(target.requirements.some(r=>r.id==='treatment:banquet')).toBe(true);
  const review=syntheticReview(target,f.root);for(const index of [10,20,30])review.checks.find(c=>c.id===sourceTurnBoundaries(source)[index]!.id)!.status='unverified';
  expect(acceptanceFindings(target,review,review.mediaSha256,{width:128,height:72,fps:24}).filter(x=>x.includes('boundary:'))).toHaveLength(3);
  const skipped=syntheticReview(target,f.root);skipped.checks.find(c=>c.id.startsWith('boundary:'))!.ranges=[{startMs:0,endMs:500}];expect(acceptanceFindings(target,skipped,skipped.mediaSha256,{width:128,height:72,fps:24}).join(' ')).toContain('boundary itself');
 }finally{f.db.close();}
});
it('requires own-byte encoded evidence and scorecard observations; parent evidence cannot promote a derivative',()=>{
 const f=fixture('final');try{
  const target=f.target();target.key='encoded:test';for(const id of ['static','duplicates','short_inserts','colour','regressions'])target.requirements.push({id:'render:'+id,text:'Actual cut '+id});
  const candidate=retainEncodedCandidate(f.db,f.root,'p',target,{fixture:true});
  expect(()=>assertEncodedAcceptance(f.db,f.root,'p',target,candidate)).toThrow(/missing structured/);
  const parent=syntheticReview(target,f.root);parent.key='parent';recordAcceptanceReview(f.db,'p',parent);expect(()=>assertEncodedAcceptance(f.db,f.root,'p',target,candidate)).toThrow(/missing structured/);
  const review=syntheticReview(target,f.root);review.checks.find(c=>c.id==='render:duplicates')!.status='unverified';recordAcceptanceReview(f.db,'p',review);expect(()=>assertEncodedAcceptance(f.db,f.root,'p',target,candidate)).toThrow(/duplicates/);
  recordAcceptanceReview(f.db,'p',syntheticReview(target,f.root));expect(()=>assertEncodedAcceptance(f.db,f.root,'p',target,candidate)).not.toThrow();
  writeFileSync(f.file,'changed output');expect(()=>assertEncodedAcceptance(f.db,f.root,'p',target,candidate)).toThrow(/encoded candidate/);
 }finally{f.db.close();}
});
it('holds a shorter decoded speaking candidate even when review claims the full requested interval',()=>{
 const f=fixture();try{const target=attemptAcceptanceTarget(f.db,f.root,'p','take',2000);recordAcceptanceReview(f.db,'p',syntheticReview(target,f.root));expect(()=>assertAcceptanceEvidence(f.db,f.root,'p',target)).toThrow(/shorter/);}finally{f.db.close();}
});

it('invokes delivery sample-rate scorecard on the exact encoded file without imposing legacy ambience thresholds',()=>{
 const f=fixture('final',44100);try{
  const target=f.target();target.key='wrong-delivery-rate';for(const id of ['static','duplicates','short_inserts','colour','regressions'])target.requirements.push({id:'render:'+id,text:'Observed '+id});
  const candidate=retainEncodedCandidate(f.db,f.root,'p',target,{});recordAcceptanceReview(f.db,'p',syntheticReview(target,f.root));
  expect(()=>assertEncodedAcceptance(f.db,f.root,'p',target,candidate)).toThrow(/48 kHz/);
 }finally{f.db.close();}
});
it('reopens historical accepted selections without retroactive review or production writes',()=>{
 for(const kind of ['lip','covered','final'] as const){const f=fixture(kind);try{
  f.db.exec("UPDATE generation_attempts SET status='accepted';INSERT INTO clips(id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)VALUES('historical','shot','take',0,1000,1)");
  const before=f.db.prepare('SELECT COUNT(*) n FROM review_notes').get()!.n;
  expect(f.accept()).toMatchObject({clipId:'historical',reused:true});expect(f.db.prepare('SELECT COUNT(*) n FROM review_notes').get()!.n).toBe(before);
 }finally{f.db.close();}}
});

it('holds corrupted retained LTX transport/carry receipts without calling a backend',()=>{
 const f=fixture();try{
  const sha=mediaHash(f.file),reference=join(f.root,'assets/ref.png'),source=join(f.root,'assets/source.wav');
  copyFileSync(source,join(f.root,'assets/full-line.wav'));copyFileSync(source,join(f.root,'assets/section-0.wav'));
  const section={index:0,sourceStartSample:0,sourceEndSample:48000,pictureStartFrame:0,retainedFrames:24,lastRetainedFrameIndex:23,tailPaddingSamples:0,generationContainerSeconds:1};
  const line={outputSha256:sha,source:{path:'source.wav',sourceSha256:mediaHash(source),sourceStartSample:0,sourceEndSample:48000},fullLineAudioSha256:mediaHash(source),plan:{sampleRate:48000,sampleCount:48000,totalFrames:24,sections:[section]},sections:[{...section,rawPath:'candidate.mp4',rawSha256:sha,submittedAudioSha256:mediaHash(source),carryImagePath:'ref.png',carryImageSha256:mediaHash(reference)}]};
  const save=(value:unknown)=>writeFileSync(join(f.root,'assets/line.json'),JSON.stringify(value));save(line);
  expect(()=>retainedSpeakingInputs(f.root,'candidate.mp4')).not.toThrow();
  for(const patch of [{sourceStartSample:1},{sourceEndSample:47999},{lastRetainedFrameIndex:119}]){
   const changed=structuredClone(line);Object.assign(changed.sections[0]!,patch);save(changed);expect(()=>retainedSpeakingInputs(f.root,'candidate.mp4')).toThrow(/QC hold/);
  }
  save(line);writeFileSync(join(f.root,'assets/section-0.wav'),'repeated or changed sample bytes');expect(()=>retainedSpeakingInputs(f.root,'candidate.mp4')).toThrow(/evidence changed/);
  copyFileSync(source,join(f.root,'assets/section-0.wav'));writeFileSync(reference,'padded native tail substituted for carry');expect(()=>retainedSpeakingInputs(f.root,'candidate.mp4')).toThrow(/evidence changed/);
 }finally{f.db.close();}
});

it('does not invent a visible speaker obligation for an intentional nonspeaking listener shot',()=>{
 const f=fixture('final');try{
  f.db.exec("DELETE FROM shot_characters"); // Dialogue owner remains c, entirely off screen.
  const target=f.target();expect(target.requirements.some(r=>r.id.startsWith('identity:')||r.id.startsWith('speech'))).toBe(false);
  recordAcceptanceReview(f.db,'p',syntheticReview(target,f.root));expect(f.accept()).toMatchObject({reused:false});
 }finally{f.db.close();}
});
