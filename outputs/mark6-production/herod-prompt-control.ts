// One producer-authorized diagnostic. Uses existing local/AV budget wrappers;
// never changes source, canon, pipeline defaults, film selections or counters.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {hasCurrentSourceReview} from '../../src/pipeline/ingestion/source-review.js';
import {mark6NativeBudget} from './native-budget.js';
import {callBoundedAv} from './av-call.js';
const ops=resolve('outputs/mark6-production'),parent=join(ops,'representative-test-20261104'),dir=join(parent,'prompt-control-v1');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const inputs=read(join(parent,'inputs.json')),actor=inputs.actors.herod,assets=resolve(inputs.dataDir,'assets');
const baseline=join(assets,'generated/lip-sync/ltx-mark6-representative-herod-20261104-v1'),old=read(join(baseline,'attempt-0/attempt.json')),line=read(join(baseline,'line.json'));
const image=join(baseline,'start.png'),audio=join(baseline,'section-0.wav'),output=join(inputs.root,'prompt-control-v1');
const phase=process.argv[2]??'',manifest=join(dir,'manifest.json');
const prompt="A steady photorealistic speaking portrait of the single Papuan man in the supplied approved Herod frame. Preserve his exact identity, age, short salt-and-pepper curls, short beard, fine cream tunic with clean bound neckline, burgundy mantle with narrow woven gold borders and warm palace background. Keep his full face visible and the camera locked in a 16:9 landscape composition. He speaks the entire supplied Hatam audio performance. His lips, jaw and facial movement follow the complete supplied audio performance at its original timing, including its pauses, pace and emphasis. Begin with the actual recording, without adding a preparatory performance or an invented delay. His head movement is subtle and natural; blinking and breathing are restrained. When the recorded speech ends, his lips settle naturally and remain at rest. Preserve the supplied composed expression; introduce no smile, threat or oath gesture. The picture is plain photographic footage of this one person and the reference background. Keep every frame free of text, subtitles, captions, lettering, transcription, translations, titles, logos and graphic overlays. No additional people, dialogue, singing, music or invented vocal sounds. Keep the camera fixed and continue the same performance through its natural pause.";
const fixed=(r:any)=>Object.fromEntries(Object.entries(r).filter(([k])=>!['prompt','imagePath','audioPath'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...args],{windowsHide:true,stdio:'pipe'});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true}));
if(!['prepare','generate','assemble','review'].includes(phase))throw Error('Choose prepare/generate/assemble/review; no implicit calls or retries');
mkdirSync(dir,{recursive:true});mkdirSync(output,{recursive:true});
if(phase==='prepare'){
 if(existsSync(manifest))throw Error('Diagnostic manifest already retained; inspect it instead of replacing it');
 if(hash(image)!==old.imageSha256||hash(audio)!==old.audioSha256)throw Error('Baseline media differs from actual submitted inputs');
 const section=line.plan.sections[0];if(section.sourceStartSample!==0||section.sourceEndSample!==176000||section.retainedFrames!==88)throw Error('Baseline scope changed');
 const value={status:'authorized_single_clip_prompt_comparison',producerInstruction:'Dan: continue. I approve. 2026-11-04',testOnly:true,changedVariable:'performance_prompt_only',maximumNewLocalGenerations:1,maximumNewAvReviews:1,image:{path:image,sha256:hash(image)},audio:{path:audio,sha256:hash(audio),sampleRate:48000,channels:2,containerSeconds:5,originalSpeechSamples:176000},baselineRequest:old.request,fixedRequestFields:fixed(old.request),prompt,promptSha256:createHash('sha256').update(prompt).digest('hex'),crop:inputs.crop,retainedFrames:88,durationSec:88/24,output,previousFailure:'Original first Herod section retained speech with effectively still mouth. No existing failure is waived.',limitation:'A single-clip diagnostic cannot establish a complete line, representative sequence or film approval.'};
 writeFileSync(manifest,JSON.stringify(value,null,2));writeFileSync(join(output,'manifest.json'),JSON.stringify(value,null,2));console.log(JSON.stringify({status:value.status,fixedRequestFields:value.fixedRequestFields,changedVariable:value.changedVariable}));
}else if(phase==='generate'){
 const m=read(manifest),db=new DatabaseSync(join(inputs.dataDir,'db/heartword.sqlite'),{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
 for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','ELEVENLABS_API_KEY','OPENAI_API_KEY','CODEX_API_KEY'])delete process.env[key];
 if(existsSync(join(dir,'result.json')))throw Error('Retained diagnostic result exists; never repeat implicitly');
 const authorize=()=>{
  const s=read(join(ops,'execution.json'));
  if(s.productionHold!==false||s.productionScope!=='single_clip_prompt_diagnostic_only'||!hasCurrentSourceReview(db,inputs.projectId))throw Error('Current bounded diagnostic/source authorization required');
  const cv=db.prepare("SELECT voice_id FROM character_versions WHERE id=? AND character_id=? AND status='approved'").get(actor.versionId,actor.characterId);
  if(!cv||cv.voice_id!==actor.voiceId||hash(image)!==m.image.sha256||hash(audio)!==m.audio.sha256||m.prompt!==prompt)throw Error('Pinned diagnostic input/canon changed');
  for(const r of inputs.references.filter((r:any)=>r.path.includes('herod-antipas')))if(hash(r.path)!==r.sha256)throw Error('Approved reference changed');
 };
 authorize();writeFileSync(join(dir,'worker-status.json'),JSON.stringify({status:'running',pid:process.pid,at:new Date().toISOString()}));
 try{
  const result=await mark6NativeBudget(ops).section({dataDir:inputs.dataDir,directory:join(output,'attempt'),image,audio,prompt,authorizeSubmission:authorize});
  const actual=read(result.attemptPath);
  if(JSON.stringify(fixed(actual.request))!==JSON.stringify(m.fixedRequestFields)||actual.imageSha256!==m.image.sha256||actual.audioSha256!==m.audio.sha256||actual.request.prompt!==prompt)throw Error('Diagnostic changed an unintended request field; held');
  writeFileSync(join(dir,'result.json'),JSON.stringify({...result,status:'returned_unreviewed',changedVariable:'performance_prompt_only',unchangedImageAndAudioBytes:true,actualFixedRequestFields:fixed(actual.request)},null,2));
  writeFileSync(join(dir,'worker-status.json'),JSON.stringify({status:'returned_unreviewed',pid:null,at:new Date().toISOString()}));console.log(JSON.stringify({status:'returned_unreviewed',changedVariable:'performance_prompt_only',rawPath:result.rawPath}));
 }catch(e){writeFileSync(join(dir,'worker-status.json'),JSON.stringify({status:'held_no_retry',pid:null,error:String((e as Error).message),at:new Date().toISOString()}));throw e;}finally{db.close();}
}else if(phase==='assemble'){
 const m=read(manifest),r=read(join(dir,'result.json')),raw=r.rawPath,original=join(baseline,'attempt-0/raw.mp4');
 for(const p of [raw,original]){const v=probe(p).streams.find((s:any)=>s.codec_type==='video');if(v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)<88)throw Error('Actual native picture coverage is insufficient');}
 const wav=join(output,'original-speech.wav');if(!existsSync(wav))ff(['-i',audio,'-af','atrim=end_sample=176000,asetpts=PTS-STARTPTS','-c:a','pcm_s16le',wav]);
 const single=join(output,'prompt-control-review.mp4'),comparison=join(output,'baseline-left-prompt-control-right.mp4'),c=m.crop;
 if(!existsSync(single))ff(['-i',raw,'-i',wav,'-vf',`trim=end_frame=88,setpts=PTS-STARTPTS,crop=${c.width}:${c.height}:${c.x}:${c.y},scale=1280:720`,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',single]);
 if(!existsSync(comparison))ff(['-i',original,'-i',raw,'-i',wav,'-filter_complex',`[0:v]trim=end_frame=88,setpts=PTS-STARTPTS,crop=${c.width}:${c.height}:${c.x}:${c.y},scale=640:360[l];[1:v]trim=end_frame=88,setpts=PTS-STARTPTS,crop=${c.width}:${c.height}:${c.x}:${c.y},scale=640:360[r];[l][r]hstack=inputs=2[v]`,'-map','[v]','-map','2:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',comparison]);
 const value={status:'assembled_diagnostic_held_for_AV_review',single:{path:single,sha256:hash(single)},comparison:{path:comparison,sha256:hash(comparison)},originalSpeech:{path:wav,sha256:hash(wav)},durationSec:88/24,frames:88,sourceSpeed:1,changedVariable:'performance_prompt_only',testOnly:true};
 for(const p of [single,comparison])if(Number(probe(p).streams.find((s:any)=>s.codec_type==='video').nb_read_frames)!==88)throw Error('Assembly frame count differs');
 writeFileSync(join(dir,'assembly.json'),JSON.stringify(value,null,2));console.log(JSON.stringify(value));
}else{
 (await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
 const a=read(join(dir,'assembly.json')),names=['audible_speech_alignment','improvement_over_baseline','mouth_rest_and_onset','identity_wardrobe_crop','generated_text'];
 const schema={type:'object',properties:{status:{type:'string',enum:['clear','hold','unverified']},summary:{type:'string'},limitations:{type:'string'},checks:{type:'array',items:{type:'object',properties:{name:{type:'string',enum:names},status:{type:'string',enum:['clear','hold','unverified']},evidence:{type:'string'},requestedChange:{type:'string'}},required:['name','status','evidence','requestedChange']}}},required:['status','summary','limitations','checks']};
 const response=await callBoundedAv<any>({id:'mark6_herod_prompt_control_20261104_v1',category:'correctionReserve',schema,
  prompt:'Review the actual attached3.666667-second diagnostic videos with audio. The first video is a side-by-side comparison: LEFT is the original failed first Herod section; RIGHT is the new prompt-only control. The second video shows the same new control at full size. Both sides share the same exact original Hatam speech, 48kHz stereo source bytes, start image bytes, seed42, Fast model,720p,24fps,5-second native container and retained first88frames/crop. ONLY the performance prompt changed toward the earlier successful explicit speaking recipe. Listen and compare visible phonetic lip/jaw articulation at onset, middle and end, rather than general head motion. Source contains real speech0–1.79494s and1.99275–3.66265s, with measured quiet1.79494–1.99275s. Do not call closed lips in that quiet interval a failure. Determine whether the right/control truly follows audible speech and improves on the largely still baseline, or still lacks speech-driven movement. Bareheaded Herod, clean cream tunic/burgundy-gold mantle; exact approved head/body refs attached. Check crop, identity and generated text. Mild emphasis is acceptable for his vow; no new smile/threat is required. Score every named check exactly once clear/hold/unverified with concrete observed evidence. No native Hatam certification, new translation/alignment or complete-line/film approval. No interpolation, audio shifting or invented pauses as a repair. Actual video sampled12fps limits sub-frame certainty. A single successful short section cannot establish a whole line.',
  media:[{...a.comparison,mimeType:'video/mp4',caption:'LEFT baseline / RIGHT changed-prompt control. Same exact soundtrack for both sides.',fps:12},{...a.single,mimeType:'video/mp4',caption:'New prompt-only control at full size, same soundtrack and interval.',fps:12},...inputs.references.filter((r:any)=>r.path.includes('herod-antipas')).map((r:any)=>({...r,mimeType:'image/png',caption:r.path.includes('headshot')?'Approved facial identity; body governs neckline.':'Approved governing formal wardrobe.'}))]});
 if(!response.result||response.result.checks?.length!==names.length||new Set(response.result.checks.map((c:any)=>c.name)).size!==names.length)throw Error('Incomplete diagnostic review; retain result and hold without repeat');
 writeFileSync(join(dir,'av-review.json'),JSON.stringify({status:'diagnostic_only_not_film_acceptance',...response},null,2));console.log(JSON.stringify(response));
}
