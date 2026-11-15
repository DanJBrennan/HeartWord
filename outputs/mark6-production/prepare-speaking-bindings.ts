import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {readConfirmedSpeechRuns} from '../../src/pipeline/ingestion/continuous-speech.js';
import {detectSilences} from '../../src/pipeline/ingestion/detect-silences.js';
import {planShortSpeaking} from '../../src/pipeline/voice-lipsync/short-speaking-plan.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),projectId=read(root+'/workspace.json').projectId,db=getDb();
if(existsSync(root+'/speaking-binding-proposals.json'))throw Error('Existing proposals must be reconciled, not overwritten.');
const manifest=read('outputs/mark6-preparation/voice-queue-v1/manifest.json'),projection=read(root+'/source-projection.json'),fits=read(root+'/fitted-cast-audio.json'),plans=read(root+'/fitted-cast-section-plans.json'),runs=readConfirmedSpeechRuns(db,projectId);
const shots=db.prepare('SELECT s.id,sc.sequence sceneSequence,s.sequence,s.verse_ref,s.dialogue_character_id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? AND s.needs_lip_sync=1 ORDER BY sc.sequence,s.sequence').all(projectId) as any[];
const range=(ref:string)=>{const m=ref.match(/:(\d+)(?:-(\d+))?/)!;return{start:+m[1],end:+(m[2]??m[1])};};
const assigned=new Set<string>(),proposals:any[]=[];
const out=join(getDataDir(),'assets','generated','hatam','mark-6','speaking-window-evidence-20261102');mkdirSync(out,{recursive:true});
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const q of manifest.entries.filter((q:any)=>q.characterId)){
 const qr=range(q.verse),targets=shots.filter(s=>{const sr=range(s.verse_ref);return s.dialogue_character_id===q.characterId&&sr.start<=qr.end&&sr.end>=qr.start;});
 if(!targets.length||targets.some(s=>assigned.has(s.id)))throw Error('Ambiguous/missing source-to-shot mapping '+q.id);
 const source=projection.rows.find((r:any)=>r.quoteId===q.id),fit=fits.rows.find((r:any)=>r.id===q.id),parent=plans.rows.find((r:any)=>r.id===q.id),run=runs.find(r=>r.members.some(m=>m.id===source.id));
 if(!run||hash(fit.path)!==fit.sha256)throw Error('Source/cast authority changed');
 const cuts=[0],sharedQuiet:any[]=[];
 if(targets.length>1){if(!q.inputPath||hash(q.inputPath)!==q.inputSha256)throw Error('No unchanged original clip for internal picture boundary');
  const originalQuiet=detectSilences(q.inputPath,{noiseFloorDb:-30,minDurationSec:.15});
  for(const a of originalQuiet)for(const b of parent.quiet){const s=Math.max(Math.round(a.startMs*48),b.startSample),e=Math.min(Math.round(a.endMs*48),b.endSample);if(e>s)sharedQuiet.push({startSample:s,endSample:e});}
  for(let part=1;part<targets.length;part++){
   const goal=fit.sampleCount*part/targets.length;
   const candidates=parent.plan.sections.slice(0,-1).map((s:any)=>s.sourceEndSample).filter((s:number)=>s>cuts.at(-1)!&&s<fit.sampleCount&&sharedQuiet.some(q=>s>=q.startSample&&s<=q.endSample)).sort((a:number,b:number)=>Math.abs(a-goal)-Math.abs(b-goal));
   if(!candidates.length)throw Error('No independently measured shared quiet cut '+q.id);cuts.push(candidates[0]);
  }
 }
 cuts.push(fit.sampleCount);
 for(let part=0;part<targets.length;part++){
  const shot=targets[part],first=cuts[part],last=cuts[part+1];assigned.add(shot.id);
  const path=join(out,q.id+'-view-'+(part+1)+'.wav');
  execFileSync('ffmpeg',['-v','error','-nostdin','-n','-i',fit.path,'-af',`atrim=start_sample=${first}:end_sample=${last},asetpts=PTS-STARTPTS,pan=stereo|c0=c0|c1=c0`,'-c:a','pcm_s16le',path],{windowsHide:true,stdio:'pipe'});
  const quiet=detectSilences(path,{noiseFloorDb:-30,minDurationSec:.15}).map(g=>({startSample:Math.max(0,Math.round(g.startMs*48)),endSample:Math.min(last-first,Math.round(g.endMs*48))})).filter(g=>g.endSample>g.startSample);
  const plan=planShortSpeaking({sampleRate:48000,sampleCount:last-first,quiet});
  const startMs=first===0?source.startMs:source.startMs+first/48,endMs=last===fit.sampleCount?source.endMs:source.startMs+last/48;
  const timingEvidence=targets.length===1?`Exact whole quotation ${q.id}, retained source samples${q.sourceWindow.startSample}–${q.sourceWindow.endSample}/24000Hz and source-specific prior boundary checks. Producer accepted prepared timing for review production. No internal verse/phrase timing inferred.`:`Picture-only view${part+1}/${targets.length} of ONE continuous quotation${q.id} (${q.verse}). Cast samples${first}–${last}/48000Hz partition the complete unchanged performance exactly. Internal cut is in independently measured shared ORIGINAL-and-CAST quiet (-30dB/150ms); it is NOT asserted to be an English sentence, verse boundary or emotional-phrase location. Final soundtrack remains the one full-line cast asset, with no silence inserted or words omitted. Printed shot verse is conceptual relevance only; exact semantic word timing remains unresolved.`;
  proposals.push({projectId,shotId:shot.id,sourceSegmentId:source.id,speechRunId:run.id,startMs,endMs,characterVersionId:q.versionId,approvedBy:'HeartWord under Dan’s delegated review-production authority',timingEvidence,quoteId:q.id,canonicalVerseRange:q.verse,castPath:fit.path,castSha256:fit.sha256,castStartSample:first,castEndSample:last,preparedWindow:path,windowSha256:hash(path),plan,sharedOriginalAndCastQuiet:sharedQuiet,nonQuietInternalJoins:plan.sections.slice(0,-1).filter(s=>!s.boundaryReason.startsWith('Frame-aligned cut inside measured source quiet')).map(s=>s.index)});
 }
}
if(assigned.size!==shots.length||proposals.length!==21)throw Error('Incomplete speaking coverage');
const result={projectId,status:'sample_exact_proposals_no_live_bindings_written',proposals,sourceLines:18,speakingViews:21,totalNativeContainers:proposals.reduce((s,p)=>s+p.plan.sections.length,0),nonQuietJoinViews:proposals.filter(p=>p.nonQuietInternalJoins.length).map(p=>({quoteId:p.quoteId,shotId:p.shotId})),noNewVoiceOrVideoRequests:true};
writeFileSync(root+'/speaking-binding-proposals.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({views:21,lines:18,totalNativeContainers:result.totalNativeContainers,nonQuietJoinViews:result.nonQuietJoinViews}));
