import 'dotenv/config';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {callBoundedAv} from './av-call.js';
const root='outputs/mark6-production',folder=join(root,'scene1-complete-source-window-20261107'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const m=read(join(folder,'manifest.json')),proxy=read(join(folder,'review-proxy-proof.json')),db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
try{
 const plan=requireCurrentPlan(db,data,project);
 if(m.sourceStartSample!==0||m.sourceEndSample!==2368296||m.pictureFrames!==2369||hash(m.output)!==m.outputSha256||hash(m.sourceMixPath)!==m.sourceMixSha256||!m.aacPacketsIdenticalToSingleReferenceEncode)throw Error('Changed complete opening source window');
 if(hash(join(folder,'manifest.json'))!==proxy.sourceManifestSha256||hash(proxy.proxyPath)!==proxy.proxySha256||proxy.originalSha256!==m.outputSha256||!proxy.audioPacketsIdentical||proxy.pictureFrames!==2369||proxy.audioDurationSamples!==2368296)throw Error('Changed proxy or proof');
 for(const r of m.inputs)if(hash(r.path)!==r.sha256)throw Error('Changed selected picture');
 const media=[{path:proxy.proxyPath,sha256:proxy.proxySha256,mimeType:'video/mp4',fps:12,caption:'ACTUAL complete opening scene source0–98.679 seconds. Every2369 picture frame retained at24fps, sampled12fps for review. Audio packets copied exactly from approved scene; picture proxy is lossy. Not the complete chapter.'}];
 const referenceProof:any[]=[];
 for(const shot of [...new Set<string>(m.inputs.map((r:any)=>r.shotId))]){
  // This continuation is governed by the first window's accepted identity
  // and actual retained native endpoint, not a newly generated static K1.
  if(shot==='30837ce5-9556-4ca5-96f0-72bc1fd82b2c'){
   referenceProof.push({shotId:shot,sharedIdentityAnchorShotId:'1a3ecc10-00c7-4d1f-b0bc-0b276f4f1045',scope:'Actual second-window carry and join reviewed in moving scene; no fabricated static reference.'});continue;
  }
  const r=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot);
  if(!r?.result_asset_path)throw Error('Missing accepted picture reference');
  const p=join(data,'assets',String(r.result_asset_path)),review=resolve(folder,'reference-'+shot+'.jpg');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',p,'-frames:v','1','-q:v','2',review],{windowsHide:true});
  referenceProof.push({shotId:shot,originalPath:p,originalSha256:hash(p),reviewPath:review,reviewSha256:hash(review),transformation:'Same geometry diagnostic JPEG q2; original retained. Lossy texture does not prove subpixel identity.'});
  media.push({path:review,sha256:hash(review),mimeType:'image/jpeg',caption:'Accepted picture anchor for shot '+shot+'. Use for coarse identity/clothing/set continuity only. Actual moving scene controls its verdict.'} as any);
 }
 const names=['recorded_title_and_opening','source_speaker_order','mouth_audio_relation','teaching_take_transitions','question_reaction_reply_cuts','healing_cycles_and_sober_response','picture_identity_clothes_setting','no_captions_or_added_figures','real_motion_without_loop_or_freeze','continuous_external_audio','approved_speech_music_balance'];
 const item={type:'object',properties:{status:{type:'string',enum:['clear','hold','unverified']},evidence:{type:'string'},startSec:{type:'number'},endSec:{type:'number'}},required:['status','evidence','startSec','endSec']};
 const schema:any={type:'object',properties:{status:{type:'string',enum:['clear','hold','unverified']},summary:{type:'string'},checks:{type:'object',properties:Object.fromEntries(names.map(n=>[n,item])),required:names},limitations:{type:'array',items:{type:'string'}},corrections:{type:'array',items:{type:'string'}}},required:['status','summary','checks','limitations','corrections']};
 const prompt=`Review ONLY the ACTUAL joined opening audiovisual scene of Hatam Mark6, source0–98.679s. This is NOT a complete chapter. Eleven concrete checks require timestamped evidence, honest hold/unverified when needed.
 SOUND: original narrator0–30.789s including recorded spoken chapter title about0.567–3.259s; verse1 begins4.823s. Village spokesman question30.789–61.140s; original narrator group reaction61.140–65.500s; Jesus reply65.500–74.490s; original narrator healings/unbelief/village-teaching continuation74.490–98.679s. Narrator over a silent teacher illustration is intentional. The teaching illustration's hidden teacher mouth does not need invented lip-sync. Do not claim exact Hatam words, semantic/native-language accuracy or internal verse alignment. Preserve title and all quiet. Actual cuts after frames${m.cutAfterFrames.join(',')} at24fps; fractional rounding is picture only. Full2369frame picture ends29.333ms after exact98.679s audio. ExactPCM/AAC packet preservation is separately proved, not something hearing certifies.
 PICTURE: arrival/lateral, teaching three distinct native takes, quiet listeners, complete spokesman two windows, restrained group reaction, Jesus reply, three gentle healing cycles, sober response. Check actual shot joins, especially successive teaching takes9–27.792s, question window49s, reaction61.167s and Jesus65.5s, complete healing cycles and return/settling poses. Internal illustration cuts are editorial, not claims of precise verse word boundaries. Teacher seen backRIGHT with nine listeners. No newly speaking silent listener, extra figure, captions, collective ritual, diagnostic illness or invented event. Healing/sober illustrations accompany narration, not new dialogue. Quiet independent motion is intended; actual freezes/loops, head/body warps or objectionable lip artifacts must be flagged.
 SET/CANON: Nazareth modest limestone/plaster/timber, plain plank doorway and unglazed openings. No modern window grids or ornate later synagogue. Do not impose Capernaum basalt on Nazareth. Jesus cream central FRONT slit tunic/indigo sash/cream mantle/brown tie. Accepted picture anchors support coarse identity, same clothes and set; per-clip original canon reviews remain separate. Lens, hidden joints/feet and pixel-perfect likeness cannot be inferred.
 MIX: approved external source-clock score/speech mix, no native generated audio. Check audible continuity and intelligibility, title/tail preservation and perceptible mouth/audio relation at actual speaking passages. Music level is producer-approved; do not suggest changing it from taste. Review sampling12fps cannot prove millisecond precision. No wholefilm approval, publishing, paid fallback or generation is authorized by this review.`;
 const byteCount=media.reduce((n,x)=>n+readFileSync(x.path).length,0);if(byteCount>18*1024*1024)throw Error('Preflight packet too large, no request');
 writeFileSync(join(folder,'review-reference-encoding-proof.json'),JSON.stringify({at:new Date().toISOString(),byteCount,references:referenceProof,originalVideoUnchanged:hash(m.output)===m.outputSha256},null,2));
 const response=await callBoundedAv<any>({id:'m6_complete_opening_scene_joined_av_20261107',category:'pairedSceneReviews',prompt,schema,media});
 writeFileSync(join(folder,'joined-av-review.json'),JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,sourceManifest:join(folder,'manifest.json'),media,response},null,2),{flag:'wx'});
 console.log(JSON.stringify({costUsd:response.costUsd,result:response.result}));
}finally{db.close();}
