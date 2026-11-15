import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
if(existsSync(root+'/fitted-cast-audio.json'))throw Error('Already prepared; no overwrite.');
const plans=read(root+'/cast-section-plans.json'),dir='C:/Users/danbr/HeartWordData/assets/generated/hatam/mark-6/production-fitted-cast-20261102';mkdirSync(dir,{recursive:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),peak=(b:Buffer)=>{let p=0;for(let i=0;i<b.length;i+=2)p=Math.max(p,Math.abs(b.readInt16LE(i))/32768);return p?20*Math.log10(p):-Infinity;};
const rows=[];
for(const r of plans.rows){if(hash(readFileSync(r.path))!==r.sha256)throw Error('Raw take changed');
 const pcm=execFileSync('ffmpeg',['-v','error','-nostdin','-i',r.path,'-f','s16le','-ar','48000','-ac','1','-'],{maxBuffer:10000000,windowsHide:true}),wanted=r.sourceSamplesAt48k*2,delta=pcm.length-wanted;
 if(Math.abs(delta)>4800*2)throw Error('Duration exceeds existing100ms source contract');
 let fitted:Buffer,operation:string,removedPeakDb:number|null=null;
 if(delta>0){const tail=pcm.subarray(wanted),head=pcm.subarray(0,delta);if(peak(tail)<=-60){fitted=pcm.subarray(0,wanted);operation='remove_only_sub_minus60dB_trailing_conversion_padding';removedPeakDb=peak(tail);}else if(peak(head)<=-60){fitted=pcm.subarray(delta);operation='remove_only_sub_minus60dB_leading_conversion_padding_preserve_audible_tail';removedPeakDb=peak(head);}else throw Error('Audible excess cannot be removed: '+r.id);}
 else if(delta<0){fitted=Buffer.concat([pcm,Buffer.alloc(-delta)]);operation='append_zero_padding_without_rate_change';}
 else{fitted=pcm;operation='unchanged_decoded_pcm';}
 if(fitted.length!==wanted)throw Error('Incorrect fitted length');const path=join(dir,r.id+'.wav');
 execFileSync('ffmpeg',['-v','error','-nostdin','-n','-f','s16le','-ar','48000','-ac','1','-i','pipe:0','-c:a','pcm_s16le',path],{input:fitted,windowsHide:true});
 const check=execFileSync('ffmpeg',['-v','error','-nostdin','-i',path,'-f','s16le','-'],{maxBuffer:10000000,windowsHide:true});if(!check.equals(fitted))throw Error('PCM verification failed');
 rows.push({id:r.id,path,sha256:hash(readFileSync(path)),pcmSha256:hash(fitted),rawPath:r.path,rawSha256:r.sha256,characterId:r.characterId,versionId:r.versionId,sampleRate:48000,sampleCount:wanted/2,operation,removedOrAddedSamples:Math.abs(delta)/2,removedPeakDb:Number.isFinite(removedPeakDb)?removedPeakDb:null,speed:1,status:'candidate_audio_prepared_full_line_AV_pending'});
}
writeFileSync(root+'/fitted-cast-audio.json',JSON.stringify({rows,rawTakesPreserved:true,sourceUnchanged:true,newVoiceRequests:0},null,2),{flag:'wx'});console.log(JSON.stringify({lines:rows.length,audibleTailPreserved:rows.find(r=>r.id==='quote-18'),newVoiceRequests:0}));
