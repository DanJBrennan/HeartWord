// Local editorial derivative. Preserve original held speaking/native attempts.
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,bindAttemptRevision,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const top='outputs/mark6-production',folder=top+'/speaking-execution/travel-charge-window1-editorial-repair-20261107',speechFolder=top+'/speaking-execution/charge-window1-active-articulation-recovery-20261107',listenerFolder=top+'/native-motion/travel-charge-listeners-cutaway-20261107',project='c457a815-d07d-4902-91b5-7b936b549856',shot='0b7d5eb1-cf5d-4327-8480-c61d29583430',db=getDb(),data=getDataDir(),assets=join(data,'assets'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 const auth=productionAuthorization(db,data,project),speechId=read(speechFolder+'/result.json').attemptId,listenerId=read(listenerFolder+'/result.json').result.attemptId;
 for(const id of [speechId,listenerId])validateAttemptRevision(db,data,project,id);
 const speech=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='hold_for_review' AND operation='lip_sync'").get(speechId,shot),listener=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id='62288e58-86c4-4766-a567-f43d67d41573' AND operation='generate_final_video' AND provider='ltx_local' AND status IN ('hold_for_review','accepted')").get(listenerId);
 if(!speech?.result_asset_path||!listener?.result_asset_path||existsSync(folder))throw Error('Actual held original speaking and new native listener take required; no repeated local derivative');
 const speechRoot=dirname(join(assets,String(speech.result_asset_path))),line=read(speechRoot+'/line.json'),raw=join(assets,String(listener.result_asset_path)),probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
 if(line.plan.totalFrames!==350||line.plan.sampleCount!==700000||line.outputSha256!==hash(join(assets,String(speech.result_asset_path))))throw Error('Original complete source window changed');
 const v=probe(raw).find((s:any)=>s.codec_type==='video');if(v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)<108)throw Error('Actual listener take must supply108real24fps frames');
 const derivativeRoot=join(assets,'generated/lip-sync/mark6-travel-charge-window1-editorial-repair-20261107');if(existsSync(derivativeRoot))throw Error('Retained local derivative must be reconciled');mkdirSync(derivativeRoot,{recursive:true});mkdirSync(folder,{recursive:true});
 const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:4*1024*1024});
 const list=join(derivativeRoot,'original-speaking-pictures.txt');
 for(const s of line.sections)if(hash(s.rawPath)!==s.rawSha256)throw Error('Original native donor changed');
 writeFileSync(list,line.sections.map((s:any)=>`file '${s.picturePath.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n')+'\n');
 const audio=join(derivativeRoot,'full-line.wav');copyFileSync(speechRoot+'/full-line.wav',audio);if(hash(audio)!==line.fullLineAudioSha256)throw Error('Source audio copy changed');
 const output=join(derivativeRoot,'candidate.mp4');
 const filter='[0:v]split=2[a][b];[a]trim=end_frame=132,setpts=PTS-STARTPTS[left];[1:v]trim=end_frame=108,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[reaction];[b]trim=start_frame=240:end_frame=350,setpts=PTS-STARTPTS[right];[left][reaction][right]concat=n=3:v=1:a=0[picture]';
 ff(['-f','concat','-safe','0','-i',list,'-i',raw,'-i',audio,'-filter_complex',filter,'-map','[picture]','-map','2:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','aac','-b:a','192k','-video_track_timescale','48000','-movie_timescale','48000','-movflags','+faststart',output]);
 const final=probe(output).find((s:any)=>s.codec_type==='video');if(final.r_frame_rate!=='24/1'||Number(final.nb_read_frames)!==350)throw Error('Editorial derivative lost or repeated picture frames');
 const components={kind:'source_preserving_editorial_cutaway',originalSpeakingAttemptId:speechId,listenerAttemptId:listenerId,originalSpeakingVideoSha256:line.outputSha256,listenerVideo:{assetPath:relative(assets,raw).replaceAll('\\','/'),sha256:hash(raw)},sourceAudio:{assetPath:relative(assets,audio).replaceAll('\\','/'),sha256:hash(audio),samples:700000,sampleRate:48000,channels:2},underlyingSpeakingPictures:line.sections.map((s:any)=>({assetPath:relative(assets,s.picturePath).replaceAll('\\','/'),sha256:hash(s.picturePath),frames:s.retainedFrames})),edits:[{donor:'originalSpeakingPictures',startFrame:0,endFrameExclusive:132},{donor:'listenerVideo',startFrame:0,endFrameExclusive:108},{donor:'originalSpeakingPictures',startFrame:240,endFrameExclusive:350}],filter,frames:350,fps:24,nativeSoundExcluded:true,providerCalls:0,originalHeldAttemptPreserved:true,qualityApproval:false};
 const m={...line,pictureConstruction:'source_preserving_editorial_cutaway',underlyingSectionsAreDonorProvenanceNotUninterruptedSelectedPicture:true,editorialComponents:components,outputSha256:hash(output),status:'complete_line_held_for_review'};
 writeFileSync(derivativeRoot+'/line.json',JSON.stringify(m,null,2),{flag:'wx'});writeFileSync(output+'.json',JSON.stringify(components,null,2),{flag:'wx'});
 auth.assertCurrent();const id=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,'ffmpeg','source_preserving_editorial_cutaway','lip_sync',?,'hold_for_review',?,0,?)").run(id,shot,JSON.stringify(components),relative(assets,output).replaceAll('\\','/'),now);
  db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,id,now);bindAttemptRevision(db,project,id,auth);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,originalSpeakingAttemptId:speechId,listenerAttemptId:listenerId,result:{status:'hold_for_review',media:{path:relative(assets,output).replaceAll('\\','/')},cost:{usd:0},provenance:{provider:'ffmpeg',model:'source_preserving_editorial_cutaway'}},components,wholeQuotationApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:id,output,frames:350,samples:700000,qualityApproval:false}));
}finally{db.close();}
