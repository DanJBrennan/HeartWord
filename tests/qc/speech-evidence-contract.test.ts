import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep,basename} from "node:path";
import {beforeAll,beforeEach,afterEach,afterAll,expect,it} from "vitest";
import {assertAcceptanceEvidence,evidenceHash,measureSpeechEvidence,recordAcceptanceReview,reviewWithSpeechEvidence,type AcceptanceReview,type AcceptanceTarget,type SourceEvidence} from "../../src/pipeline/qc/acceptance-evidence.js";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const original=JSON.parse(readFileSync('tests/fixtures/mark6-50-retained-review-response.json','utf8')).result;
let root:string,db:InstanceType<typeof DatabaseSync>,target:AcceptanceTarget;
let measured:ReturnType<typeof measureSpeechEvidence>;
const native={width:128,height:72,fps:24,audioIncluded:true};
beforeAll(()=>{
 root=mkdtempSync(join(tmpdir(),'hw-speech-contract-'));mkdirSync(join(root,'assets'));
 // Deterministic generic test signal, not a replacement or detection label for Mark6 media.
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=128x72:rate=24','-f','lavfi','-i','sine=frequency=330:sample_rate=48000','-t',String(94/24),'-af',"volume=0:enable='lt(t,0.25)'",'-c:v','libx264','-c:a','aac',join(root,'assets/v.mp4')],{windowsHide:true});
 measured=measureSpeechEvidence(join(root,'assets/v.mp4'),24,94);
});
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('src/db/schema.sql','utf8'));
 db.exec("INSERT INTO projects(id,language,book,chapter,created_at,updated_at)VALUES('p','hatam','mark',6,1,1)");
 target={key:'attempt:contract-fixture',path:'v.mp4',durationMs:94*1000/24,contextHash:evidenceHash('fixture'),sourceContextHash:evidenceHash('fixture source'),sourceMediaHashes:[measured.mediaSha256],requirements:original.checks.map((c:any)=>({id:c.id,text:'Fixture obligation '+c.id}))};
});
afterEach(()=>db.close());
afterAll(()=>{if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!basename(root).startsWith('hw-speech-contract-'))throw Error('Unsafe fixture cleanup');rmSync(root,{recursive:true,force:true});});
function valid():AcceptanceReview {
 // Unrelated findings are neutralized ONLY in this test copy, to isolate the contract failure.
 const response=structuredClone(original);response.checks=response.checks.map((c:any)=>({...c,status:'clear',ranges:[{startMs:0,endMs:target.durationMs}]}));
 response.speech={reviewedFrames:[{startFrame:0,endFrameExclusive:94}],observations:measured.windows.map(w=>({startMs:w.startMs,endMs:w.endMs,audio:w.rmsDbFS>=measured.quietReferenceDb?'signal_present':'quiet',mouth:'articulating',evidence:'Explicit synthetic test observation; not a real semantic approval'}))};
 if(measured.audioEndMs<measured.durationMs)response.speech.observations.push({startMs:measured.audioEndMs,endMs:measured.durationMs,audio:"ended",mouth:"closed",evidence:"Synthetic fixture native frame tail after actual track end"});
 return reviewWithSpeechEvidence(target,response,native,measured,'Synthetic contract fixture');
}
function sourceEvidence(review:AcceptanceReview):string[] {
 const ids:string[]=[];
 for(const aspect of ['linguistic_ownership','sample_transport'] as const){
  const id=randomUUID(),checkIds=[aspect==='sample_transport'?'source_transport':'source_boundaries'];
  const note:SourceEvidence={kind:'source_evidence_v1',sourceContextHash:target.sourceContextHash!,aspect,reviewer:'Synthetic fixture, not real Hatam attestation',status:'clear',checkIds,evidence:'Explicit mechanical fixture authority only',mediaSha256:measured.mediaSha256,
   provenance:aspect==='sample_transport'?{kind:'measured_transport',method:'Fixture known signal and immutable source transport',inputHashes:target.sourceMediaHashes!,resultHash:evidenceHash(measured)}:{kind:'competent_language_review',language:'hatam',competenceAttestation:'Synthetic test capability; no real-language approval'}};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,'p','project','p',?,?,0,?)").run(id,aspect==='sample_transport'?'qc':'human',JSON.stringify(note),Date.now());ids.push(id);
 }
 review.sourceEvidenceNoteIds=ids;return ids;
}
function evaluate(review:AcceptanceReview){recordAcceptanceReview(db,'p',review);return()=>assertAcceptanceEvidence(db,root,'p',target);}
it('rejects the exact saved response without converting file endpoints into linguistic authority',()=>{
 const review=reviewWithSpeechEvidence(target,structuredClone(original),native,measured,'Saved unmodified model response');
 const run=evaluate(review);expect(run).toThrow(/source_boundaries: missing current scoped/);expect(run).toThrow(/speech_activity\/speech_rest\/speech_sync/);
});
it.each([[333,708],[1042,1375],[2042,3000]])('rejects saved quiet claim %i-%ims even with complete coverage and every other check supported',(startMs,endMs)=>{
 const review=valid();sourceEvidence(review);review.speech!.observations.push({startMs,endMs,audio:'quiet',mouth:'closed',evidence:'Saved model claim: non-vocal rest'});
 expect(evaluate(review)).toThrow(/speech_rest\/speech_activity: claimed quiet.*contradicts measured signal/);
});
it('admits correctly supported quiet, signal and scoped authority fixtures',()=>{
 const review=valid();sourceEvidence(review);expect(evaluate(review)).not.toThrow();
});
it('keeps brief closure during signal and intentional listener coverage separate from sync failure',()=>{
 const review=valid();sourceEvidence(review);review.speech!.observations.find(o=>o.audio==='signal_present')!.mouth='closed';
 review.speech!.observations.at(-1)!.mouth='not_visible';expect(evaluate(review)).not.toThrow();
});
it('does not require pause examples to cover the full line when reviewed frames and observations do',()=>{
 const review=valid();sourceEvidence(review);review.checks.find(c=>c.id==='speech_rest')!.ranges=[{startMs:0,endMs:100}];expect(evaluate(review)).not.toThrow();
});
it('rejects last-frame start, gaps and invalid end-exclusive bounds; never extends them',()=>{
 const review=valid();sourceEvidence(review);
 for(const ranges of [[{startFrame:0,endFrameExclusive:93}],[{startFrame:0,endFrameExclusive:40},{startFrame:41,endFrameExclusive:94}],[{startFrame:0,endFrameExclusive:95}]]){
  const partial=structuredClone(review);partial.speech!.reviewedFrames=ranges;expect(evaluate(partial)).toThrow(/end-exclusive whole-performance/);
 }
});
it('rejects stale measurements and unobservable state rather than manufacturing a clear',()=>{
 const review=valid();sourceEvidence(review);review.speech!.measurementHash='stale';expect(evaluate(review)).toThrow(/stale independent/);
 const uncertain=valid();sourceEvidence(uncertain);uncertain.speech!.observations[0]!.mouth='unverified';expect(evaluate(uncertain)).toThrow(/state remains unverified/);
});
it('rejects model self-granted native authority even when file coverage is complete',()=>{
 const response:any={...structuredClone(original),...valid(),sourceEvidenceNoteIds:['invented-native-record'],reviewerKind:'native',nativeLanguage:'hatam'};
 const review=reviewWithSpeechEvidence(target,response,native,measured,'Model calling itself native');
 expect(review.sourceEvidenceNoteIds).toBeUndefined();expect(evaluate(review)).toThrow(/linguistic_ownership evidence/);
});
it('rejects a QC model note posing as competent-language attestation',()=>{
 const review=valid(),ids=sourceEvidence(review);db.prepare("UPDATE review_notes SET source='qc' WHERE id=?").run(ids[0]!);
 expect(evaluate(review)).toThrow(/linguistic_ownership evidence/);
});
it.each(['source','scope','language','competence','transport'])('rejects stale or inadequate %s source proof',change=>{
 const review=valid(),ids=sourceEvidence(review),id=change==='transport'?ids[1]!:ids[0]!;
 const note=JSON.parse(String(db.prepare('SELECT note FROM review_notes WHERE id=?').get(id)!.note));
 if(change==='source')note.sourceContextHash='stale';if(change==='scope')note.checkIds=['other-boundary'];if(change==='language')note.provenance.language='different';if(change==='competence')note.provenance.competenceAttestation='';if(change==='transport')note.mediaSha256='parent-only';
 db.prepare('UPDATE review_notes SET note=? WHERE id=?').run(JSON.stringify(note),id);expect(evaluate(review)).toThrow(/missing current scoped/);
});
it('does not let an older clear override a later held linguistic observation',()=>{
 const review=valid(),ids=sourceEvidence(review),note=JSON.parse(String(db.prepare('SELECT note FROM review_notes WHERE id=?').get(ids[0]!)!.note));note.status='hold';
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES('later','p','project','p','human',?,0,?)").run(JSON.stringify(note),Date.now()+1);
 expect(evaluate(review)).toThrow(/linguistic_ownership evidence/);
});

it('keeps known-voice attribution distinct from understanding Hatam words',()=>{
 target.requirements.push({id:'audio:voice_ownership',text:'Correct known voice attribution'});
 const review=valid();review.checks.push({id:'audio:voice_ownership',requirementHash:evidenceHash('Correct known voice attribution'),status:'clear',evidence:'Known voice fixture',ranges:[{startMs:0,endMs:target.durationMs}]});sourceEvidence(review);
 const note:SourceEvidence={kind:'source_evidence_v1',sourceContextHash:target.sourceContextHash!,aspect:'speaker_attribution',reviewer:'Known-voice fixture',status:'clear',checkIds:['audio:voice_ownership'],evidence:'Compared the known voice reference',provenance:{kind:'speaker_review',basis:'Synthetic independently known speaker'}};
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES('voice','p','project','p','human',?,0,?)").run(JSON.stringify(note),Date.now());review.sourceEvidenceNoteIds!.push('voice');expect(evaluate(review)).not.toThrow();
});

it('keeps independently measured facts immutable across adapter and gate reuse',()=>{
 expect(()=>{measured.quietReferenceDb=100;}).toThrow();
 expect(()=>{measured.windows[0]!.rmsDbFS=0;}).toThrow();
 expect(measureSpeechEvidence(join(root,'assets/v.mp4'),24,94).quietReferenceDb).toBe(-30);
});

it('allows observing the retained final picture frame after a non-frame-aligned source endpoint',()=>{
 target.durationMs=3891;const review=valid();sourceEvidence(review);
 review.checks.find(c=>c.id==='speech_rest')!.ranges=[{startMs:3850,endMs:94*1000/24}];expect(evaluate(review)).not.toThrow();
});

it('rejects a premature audio-ended assertion',()=>{
 const review=valid();sourceEvidence(review);review.speech!.observations[0]!.audio='ended';expect(evaluate(review)).toThrow(/audio-ended claim precedes/);
});
it('accepts the explicit sub-frame absent-track tail without manufacturing quiet or changing picture',()=>{
 const previous=measured;
 execFileSync('ffmpeg',['-v','error','-i',join(root,'assets/v.mp4'),'-map','0:v:0','-map','0:a:0','-c:v','copy','-af','atrim=end=3.891','-c:a','aac',join(root,'assets/tail.mp4')],{windowsHide:true});
 try{
  measured=measureSpeechEvidence(join(root,'assets/tail.mp4'),24,94);target.path='tail.mp4';target.sourceMediaHashes=[measured.mediaSha256];target.durationMs=3891;
  expect(measured.audioEndMs).toBeLessThan(measured.durationMs);expect(measured.durationMs-measured.audioEndMs).toBeLessThan(1000/24);
  const review=valid();sourceEvidence(review);expect(review.speech!.observations.at(-1)!.audio).toBe('ended');expect(evaluate(review)).not.toThrow();
 }finally{measured=previous;}
});

it('allows microsecond decimal serialization without accepting an unreviewed frame',()=>{
 const review=valid();sourceEvidence(review);review.speech!.observations.at(-1)!.endMs=Number(measured.durationMs.toFixed(3));expect(evaluate(review)).not.toThrow();
 review.speech!.reviewedFrames[0]!.endFrameExclusive=93;expect(evaluate(review)).toThrow(/end-exclusive whole-performance/);
});
