// Existing verified picture proxy + unchanged original AAC for a bounded AV packet.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifiedReviewProxy} from '../../src/pipeline/qc/video-review.js';
const folder=resolve('outputs/mark6-production/complete-herod-reports-source-window-20261108'),m=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const output=join(folder,'complete-herod-reports-audiovisual-review-copy.mp4'),proofPath=join(folder,'review-input-proof.json');
if(hash(m.output)!==m.outputSha256||m.frames!==1057||m.sourceSamples!==1056708||existsSync(output)||existsSync(proofPath))throw Error('Unchanged actual complete Herod reports and new review copy required.');
const picture=verifiedReviewProxy(m.output);
execFileSync('ffmpeg',['-v','error','-nostdin','-n','-i',picture.path,'-i',m.output,'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',output],{windowsHide:true});
const streams=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
const packets=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',p],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024})).packets;
const result=streams(output),v=result.find((s:any)=>s.codec_type==='video'),a=result.find((s:any)=>s.codec_type==='audio'),originalAudio=packets(m.output),copyAudio=packets(output);
if(result.length!==2||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==1057||a.time_base!=='1/24000'||Number(a.duration_ts)!==1056708||a.channels!==2||JSON.stringify(originalAudio)!==JSON.stringify(copyAudio)||hash(m.output)!==m.outputSha256)throw Error('Review copy geometry/frame/audio-packet/source proof failed.');
const proof={at:new Date().toISOString(),originalPath:m.output,originalSha256:m.outputSha256,path:output,sha256:hash(output),pictureProxy:picture,frames:1057,fps:24,width:1280,height:720,sourceSamples:1056708,audioPacketsAndTimingIdentical:true,pictureReencodedReviewOnly:true,originalPreserved:true,providerCalls:0,limitations:'H264 CRF24 review picture is lossy, preserves temporal frames/raster/rate/duration, not pixel-identical decoded values. Exact original approved AAC packets/timing retained; no audio re-encode/gain/resampling/source edits.'};
writeFileSync(proofPath,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({path:output,sha256:proof.sha256,bytes:readFileSync(output).length,audioPacketsAndTimingIdentical:true,providerCalls:0}));
