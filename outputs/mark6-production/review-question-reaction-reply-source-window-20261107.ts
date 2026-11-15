import 'dotenv/config';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {callBoundedAv} from './av-call.js';
const root='outputs/mark6-production',folder=join(root,'question-reaction-reply-source-window-20261107'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const m=read(join(folder,'manifest.json')),db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
try{
const plan=requireCurrentPlan(db,data,project);
if(m.sourceStartSample!==738936||m.sourceEndSample!==1787760||m.pictureFrames!==1049||hash(m.output)!==m.outputSha256||hash(m.sourceMixPath)!==m.sourceMixSha256||!m.aacPacketsIdenticalToSingleReferenceEncode)throw Error('Changed verified joined source excerpt');
for(const r of m.inputs)if(hash(r.path)!==r.sha256)throw Error('Changed selected picture');
const media=[{path:m.output,sha256:m.outputSha256,mimeType:'video/mp4',fps:12,caption:'ACTUAL joined 43.701-second source excerpt containing approved cast speech, original narrator and approved music. Review complete clip and cuts, not an isolated silent candidate.'}];
const referenceProof:any[]=[];
for(const shot of ['1a3ecc10-00c7-4d1f-b0bc-0b276f4f1045','07397434-9e52-4002-8f5f-1add4c5daed1','3fab03da-fa97-475c-bb32-d2d4c1f749ba']){
 const r=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot);
 if(!r?.result_asset_path)throw Error('Missing exact accepted picture reference');
 const p=join(data,'assets',String(r.result_asset_path)),review=resolve(folder,'reference-'+shot+'.jpg');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',p,'-frames:v','1','-q:v','2',review],{windowsHide:true});
 referenceProof.push({shotId:shot,originalPath:p,originalSha256:hash(p),reviewPath:review,reviewSha256:hash(review),transformation:'Same geometry diagnostic JPEG q2; no creative changes, source PNG retained. Lossy texture cannot certify subpixel identity.'});
 media.push({path:review,sha256:hash(review),mimeType:'image/jpeg',caption:'Diagnostic same-geometry JPEG of accepted picture reference for shot '+shot+'; identity/clothes/set continuity anchor, source PNG retained, fine detail limited by JPEG. Not a substitute for actual moving-video review.'} as any);
}
const names=['source_speaker_order','mouth_audio_relation','first_to_second_window_continuity','question_to_reaction_cut','reaction_to_jesus_reply_cut','picture_identity_and_setting_continuity','no_captions_or_new_graphics','continuous_external_audio','speech_music_balance'];
const item={type:'object',properties:{status:{type:'string',enum:['clear','hold','unverified']},evidence:{type:'string'},startSec:{type:'number'},endSec:{type:'number'}},required:['status','evidence','startSec','endSec']};
const schema:any={type:'object',properties:{status:{type:'string',enum:['clear','hold','unverified']},summary:{type:'string'},checks:{type:'object',properties:Object.fromEntries(names.map(n=>[n,item])),required:names},limitations:{type:'array',items:{type:'string'}},corrections:{type:'array',items:{type:'string'}}},required:['status','summary','checks','limitations','corrections']};
const prompt='Review ONLY the actual joined audiovisual excerpt supplied. It is source30789–74490ms of Hatam Mark6, not the full chapter. It contains the complete two-window village spokesperson question (relative audio0–30.351s), original-narrator group reaction (30.351–34.711s), then Jesus reply(34.711–43.701s). First-to-second picture transition is18.208333s; question-to-reaction30.375s; reaction-to-Jesus34.708333s. These are source-frame rounding, not invented pauses. Picture1049frames24fps ends7.333ms after sound. Independent exactPCM and AACpacket proofs preserve approved master subset without gain/resample/extra gaps; do not pretend hearing proves bit-exact equality. Audit actual first/last phonemes at cuts, perceptible mouth-sync, identity/clothes/setting continuity, audio continuity, and whether speech remains intelligible over the score. Music level is producer-approved and must not be changed merely from taste. Do not claim exact Hatam words, semantic/native-language accuracy or internal verse timing. Visible mouth-motion relation can be assessed approximately; actual review sampling12fps limits millisecond claims. No new narration, unwanted native voices, captions or music added. Source-context: villagers question Jesus, reserve reaction, Jesus speaks about prophet lacking honor in hometown. Nazareth modest limestone/plaster/timber; no Capernaum basalt requirement or modern grilles. References are accepted picture anchors; actual moving footage determines any drift. Give concrete timestamped evidence for all9 checks, flag defects/uncertainty honestly; no confidence-score waiver. No fullfilm approval, publishing or generation is authorized by this review.';
const byteCount=media.reduce((n,x)=>n+readFileSync(x.path).length,0);if(byteCount>18*1024*1024)throw Error('Preflight packet too large, no request');
writeFileSync(join(folder,'review-reference-encoding-proof.json'),JSON.stringify({at:new Date().toISOString(),byteCount,references:referenceProof,originalVideoUnchanged:hash(m.output)===m.outputSha256},null,2));
const response=await callBoundedAv<any>({id:'m6_question_reaction_reply_joined_av_20261107',category:'pairedSceneReviews',prompt,schema,media});
writeFileSync(join(folder,'joined-av-review.json'),JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,sourceManifest:join(folder,'manifest.json'),media,response},null,2),{flag:'wx'});
console.log(JSON.stringify({costUsd:response.costUsd,result:response.result}));
}finally{db.close();}
