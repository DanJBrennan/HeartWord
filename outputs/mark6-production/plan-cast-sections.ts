import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {planShortSpeaking} from '../../src/pipeline/voice-lipsync/short-speaking-plan.js';
import {detectSilences} from '../../src/pipeline/ingestion/detect-silences.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),voices=read(root+'/voices/execution.json'),manifest=read('outputs/mark6-preparation/voice-queue-v1/manifest.json');
const fitted=process.argv.includes('--fitted')?read(root+'/fitted-cast-audio.json').rows:null;
const rows=[];let total=0;
for(const q of manifest.entries.filter((q:any)=>q.characterId)){
 const generated=voices.calls.find((v:any)=>v.id===q.id),fit=fitted?.find((f:any)=>f.id===q.id),path=fit?.path??generated?.outputPath??q.approvedOutputPath,expected=fit?.sha256??generated?.outputSha256??q.approvedOutputSha256;
 const sha256=createHash('sha256').update(readFileSync(path)).digest('hex');if(sha256!==expected)throw Error('Changed cast file');
 const pcm=execFileSync('ffmpeg',['-v','error','-nostdin','-i',path,'-f','s16le','-ar','48000','-ac','1','-'],{maxBuffer:10*1024*1024,windowsHide:true});
 const sampleCount=pcm.length/2,sourceSamples=(q.sourceWindow.endSample-q.sourceWindow.startSample)*2;
 const quiet=detectSilences(path,{noiseFloorDb:-30,minDurationSec:.15}).map(g=>({startSample:Math.max(0,Math.round(g.startMs*48)),endSample:Math.min(sampleCount,Math.round(g.endMs*48))})).filter(g=>g.endSample>g.startSample);
 const plan=planShortSpeaking({sampleRate:48000,sampleCount,quiet});total+=plan.sections.length;
 let tailMax=0;for(let s=Math.min(sourceSamples,sampleCount);s<sampleCount;s++)tailMax=Math.max(tailMax,Math.abs(pcm.readInt16LE(s*2))/32768);
 rows.push({id:q.id,path,sha256,characterId:q.characterId,versionId:q.versionId,sourceSamplesAt48k:sourceSamples,actualCastSamplesAt48k:sampleCount,deltaMs:(sampleCount-sourceSamples)/48,extraTailPeakDb:tailMax?20*Math.log10(tailMax):null,extraTailExactlySilent:tailMax===0,quiet,plan,nonQuietInternalJoins:plan.sections.slice(0,-1).filter(s=>!s.boundaryReason.startsWith('Frame-aligned cut inside measured source quiet')).map(s=>s.index),status:'planning_only_not_media_or_trim_acceptance'});
}
writeFileSync(root+(fitted?'/fitted-cast-section-plans.json':'/cast-section-plans.json'),JSON.stringify({rows,lines:rows.length,totalContainers:total,localGenerationCalls:0,preserveAllCastSamples:true,requiresFullLineAV:true},null,2));console.log(JSON.stringify({lines:rows.length,totalContainers:total,nonQuietJoinLines:rows.filter(r=>r.nonQuietInternalJoins.length).map(r=>r.id),nonSilentExtraTail:rows.filter(r=>r.deltaMs>0&&!r.extraTailExactlySilent).map(r=>({id:r.id,deltaMs:r.deltaMs,peakDb:r.extraTailPeakDb}))}));
